const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { powerMonitor } = require("electron");

function unixNow() {
  return Math.floor(Date.now() / 1000);
}

class TimeTracker {
  constructor({ dbPath, idleThresholdSeconds }) {
    this.dbPath = dbPath;
    this.idleThresholdSeconds = idleThresholdSeconds;
    this.timer = null;
    this.lastTick = null;
    this.startedAtMs = Date.now();
    this.buffer = {
      upSeconds: 0,
      activeSeconds: 0
    };

    this.current = {
      upSeconds: 0,
      activeSeconds: 0,
      idleSeconds: 0
    };
    this.historicalRange = {
      startDay: "2024-01-11",
      endDay: "2026-04-22"
    };
    this.historicalDayTotals = new Map();
    this.historicalSourcePath = path.join(__dirname, "aw-buckets-export.json");
    this.historicalFallbackSourcePath = path.join(
      __dirname,
      "aw-bucket-export_aw-watcher-afk_DESKTOP-1S2TMBL.json"
    );

    this._prepareDb();
    this._loadHistoricalAfkTotals();
    this._loadTodayTotals();
    this._registerPowerEvents();
  }

  _prepareDb() {
    fs.mkdirSync(path.dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ts INTEGER NOT NULL,
        day TEXT NOT NULL,
        up_seconds INTEGER NOT NULL,
        active_seconds INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_samples_day ON samples(day);
      CREATE INDEX IF NOT EXISTS idx_samples_ts ON samples(ts);
    `);

    this.insertSampleStmt = this.db.prepare(`
      INSERT INTO samples (ts, day, up_seconds, active_seconds)
      VALUES (?, ?, ?, ?)
    `);
  }

  _loadTodayTotals() {
    const today = this._toDayString(Date.now());
    const row = this._getDayTotals(today);

    this.current.upSeconds = row.up_seconds;
    this.current.activeSeconds = row.active_seconds;
    this.current.idleSeconds = Math.max(0, row.up_seconds - row.active_seconds);
  }

  _loadHistoricalAfkTotals() {
    const sourcePath = fs.existsSync(this.historicalSourcePath)
      ? this.historicalSourcePath
      : this.historicalFallbackSourcePath;
    if (!fs.existsSync(sourcePath)) {
      return;
    }

    try {
      const raw = fs.readFileSync(sourcePath, "utf8");
      const parsed = JSON.parse(raw);
      const buckets = parsed?.buckets || {};
      const bucketEntries = Object.entries(buckets);
      if (!bucketEntries.length) {
        return;
      }

      const preferred = bucketEntries.find(([name]) => name.includes("aw-watcher-afk"));
      const [, bucket] = preferred || bucketEntries[0];
      const events = Array.isArray(bucket?.events) ? bucket.events : [];
      const normalized = new Map();
      for (const event of events) {
        const status = event?.data?.status;
        const timestamp = event?.timestamp;
        const duration = Number(event?.duration || 0);
        if (!timestamp || !status || !Number.isFinite(duration) || duration <= 0) {
          continue;
        }
        const key = `${timestamp}|${status}`;
        const existing = normalized.get(key);
        if (!existing || duration > existing.duration) {
          normalized.set(key, {
            timestamp,
            duration,
            data: { status }
          });
        }
      }

      const perDayIntervals = new Map();
      const ensureDayBucket = (day) => {
        if (!perDayIntervals.has(day)) {
          perDayIntervals.set(day, {
            all: [],
            active: []
          });
        }
        return perDayIntervals.get(day);
      };

      for (const event of normalized.values()) {
        const startMs = Date.parse(event?.timestamp);
        const durationSeconds = Number(event?.duration || 0);
        if (!Number.isFinite(startMs) || !Number.isFinite(durationSeconds) || durationSeconds <= 0) {
          continue;
        }
        const endMs = startMs + (durationSeconds * 1000);
        const isActive = event?.data?.status === "not-afk";

        let cursorMs = startMs;
        while (cursorMs < endMs) {
          const currentDay = this._toDayString(cursorMs);
          const dayStart = new Date(`${currentDay}T00:00:00`);
          const nextDayMs = dayStart.getTime() + (24 * 60 * 60 * 1000);
          const chunkEndMs = Math.min(endMs, nextDayMs);
          if (chunkEndMs <= cursorMs) {
            break;
          }

          const bucket = ensureDayBucket(currentDay);
          bucket.all.push([cursorMs, chunkEndMs]);
          if (isActive) {
            bucket.active.push([cursorMs, chunkEndMs]);
          }
          cursorMs = chunkEndMs;
        }
      }

      const mergedDurationSeconds = (intervals) => {
        if (!intervals.length) {
          return 0;
        }
        intervals.sort((a, b) => a[0] - b[0]);
        let totalMs = 0;
        let [curStart, curEnd] = intervals[0];
        for (let i = 1; i < intervals.length; i += 1) {
          const [start, end] = intervals[i];
          if (start <= curEnd) {
            curEnd = Math.max(curEnd, end);
          } else {
            totalMs += Math.max(0, curEnd - curStart);
            curStart = start;
            curEnd = end;
          }
        }
        totalMs += Math.max(0, curEnd - curStart);
        return totalMs / 1000;
      };

      for (const [day, bucket] of perDayIntervals.entries()) {
        const upSeconds = mergedDurationSeconds(bucket.all);
        const activeSeconds = mergedDurationSeconds(bucket.active);
        this.historicalDayTotals.set(day, {
          upSeconds,
          activeSeconds: Math.min(activeSeconds, upSeconds)
        });
      }
    } catch (error) {
      console.error("Failed loading historical AFK totals:", error);
    }
  }

  _registerPowerEvents() {
    powerMonitor.on("suspend", () => this._flushBuffer());
    powerMonitor.on("shutdown", () => this._flushBuffer());
    powerMonitor.on("lock-screen", () => this._flushBuffer());
    powerMonitor.on("resume", () => {
      this.lastTick = Date.now();
    });
  }

  _toDayString(ms) {
    const date = new Date(ms);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  _dayOffset(offsetDays) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + offsetDays);
    return this._toDayString(d.getTime());
  }

  _shiftDay(dayString, offsetDays) {
    const d = new Date(`${dayString}T00:00:00`);
    d.setDate(d.getDate() + offsetDays);
    return this._toDayString(d.getTime());
  }

  _weekStart(dayString) {
    const d = new Date(`${dayString}T00:00:00`);
    const weekDay = d.getDay(); // 0=Sun
    d.setDate(d.getDate() - weekDay);
    return this._toDayString(d.getTime());
  }

  _periodToDays(period) {
    if (period === "daily") {
      return 1;
    }
    if (period === "monthly") {
      return 30;
    }
    if (period === "yearly") {
      return 365;
    }
    return 7;
  }

  _trackSecond() {
    const nowMs = Date.now();
    if (!this.lastTick) {
      this.lastTick = nowMs;
      return;
    }

    const elapsedSeconds = Math.max(1, Math.floor((nowMs - this.lastTick) / 1000));
    this.lastTick = nowMs;

    const idleSeconds = powerMonitor.getSystemIdleTime();
    const isActive = idleSeconds < this.idleThresholdSeconds;

    this.buffer.upSeconds += elapsedSeconds;
    this.current.upSeconds += elapsedSeconds;

    if (isActive) {
      this.buffer.activeSeconds += elapsedSeconds;
      this.current.activeSeconds += elapsedSeconds;
    }
    this.current.idleSeconds = Math.max(0, this.current.upSeconds - this.current.activeSeconds);

    if (this.buffer.upSeconds >= 10) {
      this._flushBuffer();
    }
  }

  _flushBuffer() {
    if (!this.db || this.buffer.upSeconds <= 0) {
      return;
    }

    const ts = unixNow();
    const day = this._toDayString(Date.now());
    this.insertSampleStmt.run(
      ts,
      day,
      this.buffer.upSeconds,
      this.buffer.activeSeconds
    );
    this.buffer.upSeconds = 0;
    this.buffer.activeSeconds = 0;
  }

  _pctDelta(currentValue, previousValue) {
    if (previousValue <= 0) {
      return currentValue > 0 ? 1 : 0;
    }
    return (currentValue - previousValue) / previousValue;
  }

  _isInHistoricalRange(day) {
    return day >= this.historicalRange.startDay && day <= this.historicalRange.endDay;
  }

  _getDbDayTotals(day) {
    return this.db
      .prepare(
        `SELECT
          COALESCE(SUM(up_seconds), 0) AS up_seconds,
          COALESCE(SUM(active_seconds), 0) AS active_seconds,
          MIN(ts) AS start_ts,
          MAX(ts) AS end_ts
         FROM samples
         WHERE day = ?`
      )
      .get(day);
  }

  _getHistoricalDayTotals(day) {
    const totals = this.historicalDayTotals.get(day);
    if (!totals) {
      return {
        up_seconds: 0,
        active_seconds: 0,
        start_ts: null,
        end_ts: null
      };
    }

    return {
      up_seconds: totals.upSeconds,
      active_seconds: totals.activeSeconds,
      start_ts: null,
      end_ts: null
    };
  }

  _getTotalsByDayRange(startDay, endDay) {
    let cursor = startDay;
    let up = 0;
    let active = 0;

    while (cursor <= endDay) {
      const dayTotals = this._getDayTotals(cursor);
      up += dayTotals.up_seconds || 0;
      active += dayTotals.active_seconds || 0;
      cursor = this._shiftDay(cursor, 1);
    }

    return {
      up_seconds: up,
      active_seconds: active
    };
  }

  _getDayTotals(day) {
    if (this._isInHistoricalRange(day)) {
      return this._getHistoricalDayTotals(day);
    }
    return this._getDbDayTotals(day);
  }

  _getLiveStatus() {
    const idleSeconds = powerMonitor.getSystemIdleTime();
    const isActive = idleSeconds < this.idleThresholdSeconds;
    const status = isActive ? "Active Work" : "Idle";

    const row = this.db
      .prepare(
        `SELECT
          COUNT(*) AS sample_count,
          MAX(ts) AS last_ts
         FROM samples`
      )
      .get();

    return {
      status,
      isActive,
      idleSeconds,
      idleThresholdSeconds: this.idleThresholdSeconds,
      trackingSince: new Date(this.startedAtMs).toISOString(),
      currentSessionSeconds: Math.floor((Date.now() - this.startedAtMs) / 1000),
      sampleCount: row.sample_count,
      lastSampleAt: row.last_ts ? new Date(row.last_ts * 1000).toISOString() : null
    };
  }

  start() {
    if (this.timer) {
      return;
    }
    this.lastTick = Date.now();
    this.timer = setInterval(() => this._trackSecond(), 1000);
    this.timer.unref();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this._flushBuffer();
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  getSnapshot() {
    return {
      upSecondsToday: this.current.upSeconds,
      activeSecondsToday: this.current.activeSeconds,
      idleSecondsToday: this.current.idleSeconds,
      activeRatio: this.current.upSeconds
        ? this.current.activeSeconds / this.current.upSeconds
        : 0,
      updatedAt: new Date().toISOString()
    };
  }

  getDailySummary(days = 7) {
    const safeDays = Number.isInteger(days) ? Math.max(1, Math.min(90, days)) : 7;
    this._flushBuffer();
    const rows = [];
    for (let i = 0; i < safeDays; i += 1) {
      const day = this._dayOffset(-i);
      const totals = this._getDayTotals(day);
      rows.push({
        day,
        up_seconds: totals.up_seconds || 0,
        active_seconds: totals.active_seconds || 0
      });
    }
    return rows;
  }

  getDashboard(period = "weekly", search = "") {
    const safePeriod = ["daily", "weekly", "monthly", "yearly"].includes(period) ? period : "weekly";
    const days = this._periodToDays(safePeriod);

    this._flushBuffer();

    const currentStart = this._dayOffset(-(days - 1));
    const currentEnd = this._dayOffset(0);
    const previousStart = this._dayOffset(-((days * 2) - 1));
    const previousEnd = this._dayOffset(-days);

    const currentTotals = this._getTotalsByDayRange(currentStart, currentEnd);
    const previousTotals = this._getTotalsByDayRange(previousStart, previousEnd);

    const currentIdle = Math.max(0, currentTotals.up_seconds - currentTotals.active_seconds);
    const previousIdle = Math.max(0, previousTotals.up_seconds - previousTotals.active_seconds);

    const trendRows = [];
    let trendCursor = currentStart;
    while (trendCursor <= currentEnd) {
      const totals = this._getDayTotals(trendCursor);
      const up = totals.up_seconds || 0;
      const active = totals.active_seconds || 0;
      trendRows.push({
        day: trendCursor,
        up_seconds: up,
        active_seconds: active,
        idle_seconds: Math.max(0, up - active)
      });
      trendCursor = this._shiftDay(trendCursor, 1);
    }

    const recentRaw = [];
    for (let i = 0; i < 90; i += 1) {
      const day = this._dayOffset(-i);
      const totals = this._getDayTotals(day);
      recentRaw.push({
        day,
        up_seconds: totals.up_seconds || 0,
        active_seconds: totals.active_seconds || 0,
        start_ts: totals.start_ts || null,
        end_ts: totals.end_ts || null
      });
    }

    const normalizedSearch = (search || "").trim().toLowerCase();
    const recentSessions = recentRaw
      .filter((row) => {
        if (!normalizedSearch) {
          return true;
        }
        return row.day.toLowerCase().includes(normalizedSearch);
      })
      .map((row) => ({
        day: row.day,
        up_seconds: row.up_seconds,
        active_seconds: row.active_seconds,
        idle_seconds: Math.max(0, row.up_seconds - row.active_seconds),
        ratio: row.up_seconds ? row.active_seconds / row.up_seconds : 0,
        start_ts: row.start_ts,
        end_ts: row.end_ts
      }))
      .slice(0, 30);

    const activeHours = this.db
      .prepare(
        `SELECT
          CAST(strftime('%H', ts, 'unixepoch', 'localtime') AS INTEGER) AS hour,
          SUM(active_seconds) AS active_seconds
         FROM samples
         WHERE day = ?
         GROUP BY hour
         ORDER BY active_seconds DESC
         LIMIT 5`
      )
      .all(this._dayOffset(0));

    const overview = {
      totalUpSeconds: currentTotals.up_seconds,
      totalActiveSeconds: currentTotals.active_seconds,
      totalIdleSeconds: currentIdle,
      activeRatio: currentTotals.up_seconds ? currentTotals.active_seconds / currentTotals.up_seconds : 0,
      deltaUp: this._pctDelta(currentTotals.up_seconds, previousTotals.up_seconds),
      deltaActive: this._pctDelta(currentTotals.active_seconds, previousTotals.active_seconds),
      deltaIdle: this._pctDelta(currentIdle, previousIdle)
    };

    return {
      period: safePeriod,
      days,
      range: {
        currentStart,
        currentEnd,
        previousStart,
        previousEnd
      },
      overview,
      trend: trendRows,
      recentSessions,
      activeHours,
      liveStatus: this._getLiveStatus(),
      generatedAt: new Date().toISOString()
    };
  }

  getRawSamples(days = 30) {
    const safeDays = Number.isInteger(days) ? Math.max(1, Math.min(365, days)) : 30;
    this._flushBuffer();

    return this.db
      .prepare(
        `SELECT ts, day, up_seconds, active_seconds
         FROM samples
         WHERE day >= ?
         ORDER BY ts ASC`
      )
      .all(this._dayOffset(-(safeDays - 1)));
  }

  getHomeView(day = null) {
    this._flushBuffer();
    const safeDay = day || this._dayOffset(0);
    const totals = this._getDayTotals(safeDay);
    const upSeconds = totals.up_seconds || 0;
    const activeSeconds = totals.active_seconds || 0;
    const idleSeconds = Math.max(0, upSeconds - activeSeconds);

    return {
      day: safeDay,
      upSeconds,
      activeSeconds,
      idleSeconds,
      activeRatio: upSeconds ? activeSeconds / upSeconds : 0
    };
  }

  getDetailsView({ focusDate = null, granularity = "day" } = {}) {
    this._flushBuffer();
    const safeGranularity = granularity === "week" ? "week" : "day";
    const day = focusDate || this._dayOffset(0);
    const dayTotals = this._getDayTotals(day);
    const dayUp = dayTotals.up_seconds || 0;
    const dayActive = dayTotals.active_seconds || 0;
    const dayIdle = Math.max(0, dayUp - dayActive);

    let bars = [];

    if (safeGranularity === "day") {
      const weekStart = this._weekStart(day);
      for (let i = 0; i < 7; i += 1) {
        const curDay = this._shiftDay(weekStart, i);
        const totals = this._getDayTotals(curDay);
        const up = totals.up_seconds || 0;
        const active = totals.active_seconds || 0;
        bars.push({
          key: curDay,
          label: curDay,
          upSeconds: up,
          activeSeconds: active,
          idleSeconds: Math.max(0, up - active),
          selected: curDay === day
        });
      }
    } else {
      const focusWeekStart = this._weekStart(day);
      for (let i = 7; i >= 0; i -= 1) {
        const currentWeekStart = this._shiftDay(focusWeekStart, -(i * 7));
        const currentWeekEnd = this._shiftDay(currentWeekStart, 6);
        const totals = this._getTotalsByDayRange(currentWeekStart, currentWeekEnd);
        const up = totals.up_seconds || 0;
        const active = totals.active_seconds || 0;
        bars.push({
          key: currentWeekStart,
          label: `${currentWeekStart}..${currentWeekEnd}`,
          upSeconds: up,
          activeSeconds: active,
          idleSeconds: Math.max(0, up - active),
          selected: currentWeekStart === focusWeekStart
        });
      }
    }

    return {
      focusDate: day,
      granularity: safeGranularity,
      summary: {
        upSeconds: dayUp,
        activeSeconds: dayActive,
        idleSeconds: dayIdle,
        startTs: dayTotals.start_ts || null,
        endTs: dayTotals.end_ts || null
      },
      bars,
      appList: []
    };
  }

  exportData({ format = "csv", filePath, period = "weekly" }) {
    if (!filePath) {
      throw new Error("Export file path is required");
    }

    const safeFormat = format === "json" ? "json" : "csv";
    const dashboard = this.getDashboard(period);
    const rows = this.getRawSamples(this._periodToDays(dashboard.period));

    let content = "";
    if (safeFormat === "json") {
      content = JSON.stringify(
        {
          exportedAt: new Date().toISOString(),
          period: dashboard.period,
          dashboard,
          samples: rows
        },
        null,
        2
      );
    } else {
      const header = "day,timestamp_iso,up_seconds,active_seconds,idle_seconds";
      const lines = rows.map((row) => {
        const timestampIso = new Date(row.ts * 1000).toISOString();
        const idleSeconds = Math.max(0, row.up_seconds - row.active_seconds);
        return `${row.day},${timestampIso},${row.up_seconds},${row.active_seconds},${idleSeconds}`;
      });
      content = [header, ...lines].join("\n");
    }

    fs.writeFileSync(filePath, content, "utf8");
    return {
      ok: true,
      filePath,
      format: safeFormat,
      bytes: Buffer.byteLength(content, "utf8"),
      rowCount: rows.length
    };
  }
}

module.exports = { TimeTracker };
