import { useState, useEffect, useMemo } from "react";

// ─── 設定 ─────────────────────────────────────────────────────────
// Vercel 部署時在環境變數設定 VITE_API_BASE = 你的 Railway 後端網址
// 例如：https://taiwan-futures-backend.up.railway.app
const API_BASE = "http://192.168.1.163:8001"

// ─── 預設資料（後端離線時的 Fallback）──────────────────────────────
const DEFAULT_NEWS = [
  { id: 1, title: "NVIDIA Q4 財報優於預期，AI 伺服器需求強勁", source: "Reuters", time: "2026-03-11 08:35", category: "半導體", sentiment: "bullish", sentimentScore: 82, impactScore: 88, interpretation: "NVIDIA 業績超預期，AI 供應鏈持續受惠，正向帶動台指電子權值" },
  { id: 2, title: "Fed 維持利率不變，鮑威爾暗示年內可能降息", source: "Bloomberg", time: "2026-03-11 06:20", category: "總經", sentiment: "bullish", sentimentScore: 65, impactScore: 75, interpretation: "利率政策偏鴿，有利風險資產，間接利多台指" },
  { id: 3, title: "美國擬擴大 AI 晶片出口限制至東南亞", source: "WSJ", time: "2026-03-11 04:15", category: "政策", sentiment: "bearish", sentimentScore: -55, impactScore: 70, interpretation: "出口管制擴大可能影響部分半導體訂單" },
];

const DEFAULT_MARKET = [
  { symbol: "那斯達克期貨", price: 20485.50, change: 185.25, changePct: 0.91, status: "up" },
  { symbol: "S&P 500 期貨", price: 5842.00, change: 32.50, changePct: 0.56, status: "up" },
  { symbol: "費半指數", price: 4920.80, change: 98.40, changePct: 2.04, status: "up" },
  { symbol: "NVIDIA 輝達", price: 142.85, change: 6.30, changePct: 4.61, status: "up" },
  { symbol: "台積電 ADR", price: 198.40, change: 5.40, changePct: 2.80, status: "up" },
  { symbol: "VIX 恐慌指數", price: 16.20, change: -1.80, changePct: -10.00, status: "down" },
  { symbol: "美元/日圓", price: 152.35, change: 0.85, changePct: 0.56, status: "up" },
  { symbol: "日經 225", price: 39850, change: 420, changePct: 1.06, status: "up" },
  { symbol: "台指期", price: 22680, change: 135, changePct: 0.60, status: "up" },
  { symbol: "微台指", price: 22678, change: 132, changePct: 0.58, status: "up" },
];

const DEFAULT_SCORES = {
  globalRisk: 28, semiconductor: 42, tsmAdr: 35, policy: -12,
  asia: 15, currency: 8, priceStructure: 38, session: 5, institutional: 18,
};

const DEFAULT_POSITIONS = [
  { symbol: "微台指 TMF", direction: "long", qty: 2, avgCost: 22520, marketPrice: 22678, unrealizedPnl: 1580 },
];

const DEFAULT_SIGNAL_HISTORY = [
  { time: "03/11 09:15", scores: { globalRisk: 28, semiconductor: 42, tsmAdr: 35, policy: -12, asia: 15, currency: 8, priceStructure: 38, session: 5, institutional: 18 }, result: "進行中" },
  { time: "03/10 22:30", scores: { globalRisk: 15, semiconductor: 30, tsmAdr: 25, policy: -8, asia: 10, currency: 5, priceStructure: 20, session: -5, institutional: 12 }, result: "未交易" },
  { time: "03/09 21:45", scores: { globalRisk: 35, semiconductor: 50, tsmAdr: 40, policy: 5, asia: 18, currency: 10, priceStructure: 45, session: 8, institutional: 25 }, result: "+2,400" },
  { time: "03/09 14:20", scores: { globalRisk: -30, semiconductor: -40, tsmAdr: -35, policy: -20, asia: -12, currency: -8, priceStructure: -42, session: -8, institutional: -20 }, result: "+1,800" },
];

const INITIAL_RULES = [
  { name: "做多條件：綜合分數 > +18", status: true, type: "entry" },
  { name: "做多條件：價格突破前高", status: true, type: "entry" },
  { name: "做多條件：半導體分數 > +30", status: true, type: "entry" },
  { name: "停利：獲利達 40 點", status: false, type: "exit" },
  { name: "停損：虧損達 25 點", status: false, type: "exit" },
  { name: "風控：單日虧損 < 3000", status: true, type: "risk" },
  { name: "風控：連續停損 < 2 次", status: true, type: "risk" },
  { name: "禁單：非重大數據時段", status: true, type: "block" },
  { name: "禁單：VIX < 30", status: true, type: "block" },
];

// ─── v5 模型元資料 ────────────────────────────────────────────────
const SCORE_META = {
  globalRisk:     { max: 40,  min: -40, weight: 0.15, label: "Global Risk",       labelZh: "全球風險" },
  semiconductor:  { max: 60,  min: -60, weight: 0.18, label: "Semiconductor",     labelZh: "半導體" },
  tsmAdr:         { max: 50,  min: -50, weight: 0.15, label: "TSM ADR",           labelZh: "台積電ADR" },
  policy:         { max: 50,  min: -50, weight: 0.08, label: "Policy/Tariff",     labelZh: "政策關稅" },
  asia:           { max: 25,  min: -25, weight: 0.06, label: "Asia Sentiment",    labelZh: "亞洲市場" },
  currency:       { max: 20,  min: -20, weight: 0.05, label: "Currency",          labelZh: "匯率" },
  priceStructure: { max: 70,  min: -70, weight: 0.18, label: "Price Structure",   labelZh: "價格結構" },
  session:        { max: 15,  min: -30, weight: 0.05, label: "Session/Liquidity", labelZh: "時段流動性" },
  institutional:  { max: 60,  min: -60, weight: 0.10, label: "Institutional",     labelZh: "法人籌碼" },
};

const HISTORY_KEYS = ["globalRisk", "semiconductor", "tsmAdr", "policy", "asia", "currency", "priceStructure", "session", "institutional"];
const HISTORY_HEADERS = ["時間", "全球", "半導體", "台積電", "政策", "亞洲", "匯率", "價格", "時段", "法人", "綜合", "訊號", "結果"];

// ─── 核心計算函式 ─────────────────────────────────────────────────
function computeFinalScore(rawScores) {
  let w = 0;
  Object.entries(SCORE_META).forEach(([k, m]) => { w += (rawScores[k] || 0) * m.weight; });
  return Math.round(w * 100) / 100;
}

function getSignalLevel(score) {
  if (score >= 35) return { level: "強烈做多", color: "#00ff88", bg: "rgba(0,255,136,0.12)" };
  if (score >= 18) return { level: "偏多",     color: "#4ade80", bg: "rgba(74,222,128,0.10)" };
  if (score >= 10) return { level: "觀察偏多", color: "#a3e635", bg: "rgba(163,230,53,0.08)" };
  if (score > -10) return { level: "不交易",   color: "#94a3b8", bg: "rgba(148,163,184,0.08)" };
  if (score > -18) return { level: "觀察偏空", color: "#fb923c", bg: "rgba(251,146,60,0.08)" };
  if (score > -35) return { level: "偏空",     color: "#f87171", bg: "rgba(248,113,113,0.10)" };
  return { level: "強烈做空", color: "#ff4444", bg: "rgba(255,68,68,0.12)" };
}

// ─── 動態過濾器：根據 rules + scores 判斷訊號是否有效 ─────────────
function getFilterStatus(scores, rules) {
  const vixRule = rules.find(r => r.name.includes("VIX") && r.type === "block");
  const majorRule = rules.find(r => r.name.includes("重大數據") && r.type === "block");
  const lossRule = rules.find(r => r.name.includes("單日虧損") && r.type === "risk");

  if (vixRule && !vixRule.status) return { allowed: false, reason: "VIX 禁單規則已關閉，訊號暫停" };
  if (majorRule && !majorRule.status) return { allowed: false, reason: "重大數據時段禁單規則未通過" };
  if (lossRule && !lossRule.status) return { allowed: false, reason: "風控規則未通過，禁止交易" };
  if (scores.globalRisk < -30 && (vixRule && vixRule.status)) return { allowed: false, reason: "全球風險偏高，暫不建議交易" };

  return { allowed: true, reason: "所有過濾條件通過，訊號有效" };
}

// ─── 動態建議：根據 finalScore + rules 產生操作建議 ────────────────
function getSuggestedAction(finalScore, signal, rules, filter) {
  const entryRules = rules.filter(r => r.type === "entry");
  const entryMet = entryRules.filter(r => r.status).length;
  const entryTotal = entryRules.length;
  const allEntryMet = entryMet === entryTotal;

  if (!filter.allowed) {
    return { direction: "禁止交易", dirColor: "#f87171", entry: "-", sl: "-", tp: "-", size: "0 口", confidence: "-", warning: filter.reason };
  }

  if (finalScore >= 35 && allEntryMet) {
    return { direction: "做多", dirColor: "#00ff88", entry: "回踩支撐區", sl: "前低下方", tp: "壓力區分批", size: "2 口", confidence: "高", warning: null };
  }
  if (finalScore >= 18) {
    const note = allEntryMet ? null : `進場條件 ${entryMet}/${entryTotal} 成立，建議確認後再進場`;
    return { direction: allEntryMet ? "做多" : "觀察偏多", dirColor: "#4ade80", entry: "突破確認後", sl: "前低", tp: "前高附近", size: "1 口", confidence: "中", warning: note };
  }
  if (finalScore <= -35 && allEntryMet) {
    return { direction: "做空", dirColor: "#ff4444", entry: "反彈壓力區", sl: "前高上方", tp: "支撐區分批", size: "2 口", confidence: "高", warning: null };
  }
  if (finalScore <= -18) {
    return { direction: "觀察偏空", dirColor: "#f87171", entry: "等反彈確認", sl: "站回前高", tp: "跌破支撐", size: "1 口", confidence: "中", warning: null };
  }

  return { direction: "觀望", dirColor: "#94a3b8", entry: "等待方向", sl: "-", tp: "-", size: "0 口", confidence: "低", warning: "市場無明確方向，不建議進場" };
}

// ─── Utility ──────────────────────────────────────────────────────
const fmtInt = (n) => (n >= 0 ? "+" : "") + n.toLocaleString();

// ─── 共用樣式常數 ─────────────────────────────────────────────────
const S = {
  mono: { fontFamily: "'JetBrains Mono', monospace" },
  panel: { background: "#0f172a", borderRadius: 8, border: "1px solid #1e293b", overflow: "hidden" },
  panelHeader: {
    padding: "12px 16px", borderBottom: "1px solid #1e293b",
    fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: 1.5,
    fontFamily: "'JetBrains Mono', monospace"
  },
  badge: (color) => ({
    fontSize: 10, padding: "2px 8px", borderRadius: 3,
    background: color, color: "#0f172a",
    fontWeight: 700, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 0.5
  }),
  green: "#4ade80", red: "#f87171", gray: "#94a3b8", dim: "#64748b", dimmer: "#475569",
};

// ─── SignalBanner 元件 ────────────────────────────────────────────
function SignalBanner({ signal, finalScore, filter, mainReasons }) {
  return (
    <div style={{
      background: signal.bg, border: `1px solid ${signal.color}30`,
      borderRadius: 10, padding: "20px 24px", marginBottom: 20,
      display: "flex", justifyContent: "space-between", alignItems: "center",
      flexWrap: "wrap", gap: 16
    }}>
      <div>
        <div style={{ fontSize: 11, color: S.dim, marginBottom: 4, ...S.mono, letterSpacing: 1 }}>系統訊號 · System Signal</div>
        <span style={{ fontSize: 32, fontWeight: 800, color: signal.color, ...S.mono }}>{signal.level}</span>
        <div style={{ fontSize: 12, color: S.dim, marginTop: 6 }}>{mainReasons}</div>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 11, color: S.dim, ...S.mono }}>綜合分數</div>
        <div style={{ fontSize: 48, fontWeight: 800, color: signal.color, ...S.mono, lineHeight: 1 }}>
          {finalScore > 0 ? "+" : ""}{finalScore.toFixed(1)}
        </div>
        <div style={{ fontSize: 11, marginTop: 6, color: filter.allowed ? S.green : S.red, ...S.mono }}>
          {filter.allowed ? "● 訊號有效" : "● 訊號已封鎖"}
        </div>
      </div>
    </div>
  );
}

// ─── SuggestionPanel 元件 ─────────────────────────────────────────
function SuggestionPanel({ action, signal }) {
  const items = [
    { label: "方向", value: action.direction, color: action.dirColor },
    { label: "進場策略", value: action.entry, color: "#e2e8f0" },
    { label: "建議停損", value: action.sl, color: S.red },
    { label: "建議停利", value: action.tp, color: S.green },
    { label: "建議口數", value: action.size, color: "#60a5fa" },
    { label: "信心度", value: action.confidence, color: "#fbbf24" },
  ];

  return (
    <div style={{
      ...S.panel, marginBottom: 20, padding: "16px 20px",
      background: "linear-gradient(135deg, #0f172a, #0a1628)",
      border: `1px solid ${signal.color}20`
    }}>
      <div style={{ fontSize: 12, color: S.dim, marginBottom: 10, ...S.mono, letterSpacing: 1 }}>建議動作 · Suggested Action</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 16 }}>
        {items.map((it, i) => (
          <div key={i}>
            <div style={{ fontSize: 10, color: S.dimmer, marginBottom: 2, ...S.mono }}>{it.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: it.color, ...S.mono }}>{it.value}</div>
          </div>
        ))}
      </div>
      {action.warning && (
        <div style={{
          marginTop: 14, padding: "8px 12px", background: "rgba(251,191,36,0.08)",
          borderRadius: 6, fontSize: 12, color: "#fbbf24", border: "1px solid rgba(251,191,36,0.15)"
        }}>
          ⚠ {action.warning}
        </div>
      )}
    </div>
  );
}

// ─── ScoreBar 元件 ────────────────────────────────────────────────
function ScoreBar({ label, labelZh, value, min, max, weight }) {
  const range = max - min;
  const pct = ((value - min) / range) * 100;
  const isPos = value >= 0;
  const midPct = ((0 - min) / range) * 100;

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 12 }}>
        <span style={{ color: S.gray, ...S.mono }}>{labelZh} <span style={{ color: S.dimmer }}>×{weight}</span></span>
        <span style={{ color: isPos ? S.green : S.red, ...S.mono, fontWeight: 700 }}>{value >= 0 ? "+" : ""}{value}</span>
      </div>
      <div style={{ height: 6, background: "#1e293b", borderRadius: 3, position: "relative", overflow: "hidden" }}>
        <div style={{
          position: "absolute", top: 0,
          left: isPos ? `${midPct}%` : `${pct}%`,
          width: isPos ? `${pct - midPct}%` : `${midPct - pct}%`,
          height: "100%",
          background: isPos ? "linear-gradient(90deg, #065f46, #4ade80)" : "linear-gradient(90deg, #f87171, #7f1d1d)",
          borderRadius: 3, transition: "all 0.6s ease"
        }} />
        <div style={{ position: "absolute", top: -2, left: `${midPct}%`, width: 1, height: 10, background: S.dimmer }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#334155", marginTop: 2, ...S.mono }}>
        <span>{min}</span><span style={{ color: S.dimmer }}>{label}</span><span>+{max}</span>
      </div>
    </div>
  );
}

// ─── NewsCard 元件 ────────────────────────────────────────────────
function NewsCard({ item }) {
  const isBull = item.sentiment === "bullish";
  const sColor = isBull ? S.green : S.red;
  const sBg = isBull ? "rgba(74,222,128,0.08)" : "rgba(248,113,113,0.08)";
  const catColors = { "半導體": "#a78bfa", "總經": "#60a5fa", "政策": "#fb923c", "亞洲": "#38bdf8", "科技": "#34d399", "地緣": "#f87171" };

  return (
    <div style={{ padding: "14px 16px", borderLeft: `3px solid ${sColor}`, background: sBg, borderRadius: "0 6px 6px 0", marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 6, flexWrap: "wrap" }}>
            <span style={S.badge(catColors[item.category] || "#64748b")}>{item.category}</span>
            <span style={{ fontSize: 10, color: S.dim, ...S.mono }}>{item.time}</span>
            <span style={{ fontSize: 10, color: S.dim }}>{item.source}</span>
          </div>
          <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 600, lineHeight: 1.5, marginBottom: 6 }}>{item.title}</div>
          <div style={{ fontSize: 12, color: S.gray, lineHeight: 1.6 }}>{item.interpretation}</div>
        </div>
        <div style={{ textAlign: "right", minWidth: 80, flexShrink: 0 }}>
          <div style={{ fontSize: 10, color: S.dim, marginBottom: 2 }}>情緒</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: sColor, ...S.mono }}>{item.sentimentScore > 0 ? "+" : ""}{item.sentimentScore}</div>
          <div style={{ fontSize: 9, color: S.dimmer, marginTop: 4 }}>影響力 {item.impactScore}</div>
        </div>
      </div>
    </div>
  );
}

// ─── MarketRow 元件 ───────────────────────────────────────────────
function MarketRow({ item }) {
  const isUp = item.status === "up" && !item.symbol.includes("VIX");
  const isVixDown = item.symbol.includes("VIX") && item.change < 0;
  const color = (isUp || isVixDown) ? S.green : item.change === 0 ? S.gray : S.red;
  const hasDec = item.price % 1 !== 0;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", padding: "8px 12px", borderBottom: "1px solid #1e293b", fontSize: 13, alignItems: "center", gap: 12 }}>
      <span style={{ color: "#cbd5e1", fontWeight: 500 }}>{item.symbol}</span>
      <span style={{ color: "#e2e8f0", ...S.mono, fontWeight: 600, textAlign: "right" }}>
        {item.price ? item.price.toLocaleString(undefined, { minimumFractionDigits: hasDec ? 2 : 0 }) : "-"}
      </span>
      <span style={{ color, ...S.mono, textAlign: "right", minWidth: 70 }}>
        {item.change >= 0 ? "+" : ""}{item.change ? item.change.toLocaleString(undefined, { minimumFractionDigits: hasDec ? 2 : 0 }) : "-"}
      </span>
      <span style={{
        color, ...S.mono, textAlign: "right", minWidth: 56,
        background: color === S.green ? "rgba(74,222,128,0.1)" : color === S.red ? "rgba(248,113,113,0.1)" : "transparent",
        padding: "2px 6px", borderRadius: 3
      }}>
        {item.changePct != null ? `${item.changePct >= 0 ? "+" : ""}${item.changePct.toFixed(2)}%` : "-"}
      </span>
    </div>
  );
}

// ─── PositionSummary 元件 ─────────────────────────────────────────
function PositionSummary({ positions, brokerConnected }) {
  return (
    <div style={S.panel}>
      <div style={S.panelHeader}>持倉概要 · Position</div>
      <div style={{ padding: 16 }}>
        {!brokerConnected && (
          <div style={{ fontSize: 11, color: "#fb923c", marginBottom: 10, padding: "6px 10px", background: "rgba(251,146,60,0.08)", borderRadius: 6 }}>
            永豐金尚未接入，以下為模擬資料
          </div>
        )}
        {positions.map((p, i) => (
          <div key={i} style={{ marginBottom: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{p.symbol}</span>
              <span style={{
                fontSize: 11, padding: "2px 10px", borderRadius: 4,
                background: p.direction === "long" ? "rgba(74,222,128,0.15)" : "rgba(248,113,113,0.15)",
                color: p.direction === "long" ? S.green : S.red, ...S.mono, fontWeight: 700
              }}>{p.direction === "long" ? "多單" : "空單"} ×{p.qty}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 12 }}>
              <div><div style={{ color: S.dimmer, fontSize: 10 }}>均價</div><div style={{ ...S.mono, color: S.gray }}>{p.avgCost.toLocaleString()}</div></div>
              <div><div style={{ color: S.dimmer, fontSize: 10 }}>現價</div><div style={{ ...S.mono, color: "#e2e8f0" }}>{p.marketPrice.toLocaleString()}</div></div>
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ color: S.dimmer, fontSize: 10 }}>未實現損益</div>
                <div style={{ ...S.mono, fontSize: 20, fontWeight: 800, color: p.unrealizedPnl >= 0 ? S.green : S.red }}>{fmtInt(p.unrealizedPnl)} 元</div>
              </div>
            </div>
          </div>
        ))}
        <div style={{ marginTop: 8, padding: "8px 12px", background: "#1e293b", borderRadius: 6, fontSize: 12, color: S.dim }}>
          可用保證金 <span style={{ color: "#e2e8f0", ...S.mono, fontWeight: 600 }}>$128,400</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════
//  主 Dashboard
// ═══════════════════════════════════════════════════════════════════
export default function TaiwanFuturesDashboard() {
  // ─── State ──────────────────────────────────────────────────────
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeTab, setActiveTab] = useState("dashboard");
  const [animateIn, setAnimateIn] = useState(false);

  const [news, setNews] = useState(DEFAULT_NEWS);
  const [market, setMarket] = useState(DEFAULT_MARKET);
  const [scores, setScores] = useState(DEFAULT_SCORES);
  const [positions, setPositions] = useState(DEFAULT_POSITIONS);
  const [signalHistory, setSignalHistory] = useState(DEFAULT_SIGNAL_HISTORY);
  const [rules, setRules] = useState(INITIAL_RULES);

  const [apiStatus, setApiStatus] = useState("offline"); // online / offline / error
  const [lastUpdate, setLastUpdate] = useState(null);
  const [brokerConnected, setBrokerConnected] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  // ─── API Fetch ──────────────────────────────────────────────────
  async function fetchDashboardData() {
    try {
      const [newsRes, marketRes, scoresRes, posRes, histRes] = await Promise.all([
        fetch(`${API_BASE}/api/news`).catch(() => null),
        fetch(`${API_BASE}/api/market`).catch(() => null),
        fetch(`${API_BASE}/api/scores`).catch(() => null),
        fetch(`${API_BASE}/api/positions`).catch(() => null),
        fetch(`${API_BASE}/api/signals/history`).catch(() => null),
      ]);

      let anySuccess = false;

      if (newsRes && newsRes.ok) {
        const data = await newsRes.json();
        if (data && data.length > 0) { setNews(data); anySuccess = true; }
      }
      if (marketRes && marketRes.ok) {
        const data = await marketRes.json();
        if (data && data.length > 0) { setMarket(data); anySuccess = true; }
      }
      if (scoresRes && scoresRes.ok) {
        const data = await scoresRes.json();
        if (data && data.globalRisk !== undefined) { setScores(data); anySuccess = true; }
      }
      if (posRes && posRes.ok) {
        const data = await posRes.json();
        setBrokerConnected(data.connected || false);
        if (data.positions && data.positions.length > 0) setPositions(data.positions);
      }
      if (histRes && histRes.ok) {
        const data = await histRes.json();
        if (data && data.length > 0) setSignalHistory(prev => {
          const existing = new Set(prev.map(h => h.time));
          const newItems = data.filter(d => !existing.has(d.time));
          return [...newItems, ...prev].slice(0, 50);
        });
      }

      setApiStatus(anySuccess ? "online" : "offline");
      if (anySuccess) setLastUpdate(new Date());

      // AI 分析（獨立抓，因為較慢且快取 2 分鐘）
      try {
        const aiRes = await fetch(`${API_BASE}/api/ai-analysis`).catch(() => null);
        if (aiRes && aiRes.ok) {
          const aiData = await aiRes.json();
          if (aiData && aiData.conclusion) setAiAnalysis(aiData);
        }
      } catch {}
    } catch {
      setApiStatus("offline");
    }
  }

  // ─── Effects ────────────────────────────────────────────────────
  useEffect(() => {
    setAnimateIn(true);
    const clockTimer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(clockTimer);
  }, []);

  useEffect(() => {
    fetchDashboardData();
    const dataTimer = setInterval(fetchDashboardData, 30000);
    return () => clearInterval(dataTimer);
  }, []);

  // ─── Computed ───────────────────────────────────────────────────
  const toggleRule = (i) => setRules(prev => prev.map((r, j) => j === i ? { ...r, status: !r.status } : r));

  async function refreshAI() {
    setAiLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/ai-analysis?refresh=true`);
      if (res.ok) { const data = await res.json(); if (data.conclusion) setAiAnalysis(data); }
    } catch {}
    setAiLoading(false);
  }

  const finalScore = useMemo(() => computeFinalScore(scores), [scores]);
  const signal = useMemo(() => getSignalLevel(finalScore), [finalScore]);
  const filter = useMemo(() => getFilterStatus(scores, rules), [scores, rules]);
  const action = useMemo(() => getSuggestedAction(finalScore, signal, rules, filter), [finalScore, signal, rules, filter]);

  const scoreBarData = useMemo(() =>
    Object.entries(SCORE_META).map(([k, m]) => ({ ...m, value: scores[k] || 0 })),
    [scores]
  );

  const entryRulesMet = rules.filter(r => r.type === "entry" && r.status).length;
  const totalEntryRules = rules.filter(r => r.type === "entry").length;
  const riskRulesMet = rules.filter(r => (r.type === "risk" || r.type === "block") && r.status).length;
  const totalRiskRules = rules.filter(r => r.type === "risk" || r.type === "block").length;

  // 主因產生
  // 主因：優先用 API 回傳的 reasons，其次用 AI 分析，最後用前端計算
  const mainReasons = useMemo(() => {
    if (scores.reasons && scores.reasons.length > 0) return "主因：" + scores.reasons.join(" · ");
    if (aiAnalysis && aiAnalysis.reasons && aiAnalysis.reasons.length > 0) return "主因：" + aiAnalysis.reasons.join(" · ");
    const r = [];
    if (scores.semiconductor > 30) r.push("半導體情緒偏多");
    if (scores.semiconductor < -30) r.push("半導體情緒偏空");
    if (scores.tsmAdr > 20) r.push("台積電 ADR 強勢");
    if (scores.tsmAdr < -20) r.push("台積電 ADR 弱勢");
    if (scores.globalRisk > 20) r.push("全球風險偏好");
    if (scores.globalRisk < -20) r.push("全球風險趨避");
    if (scores.priceStructure > 25) r.push("價格結構偏多");
    if (scores.priceStructure < -25) r.push("價格結構偏空");
    if (scores.policy < -15) r.push("政策面利空");
    return r.length > 0 ? "主因：" + r.join(" · ") : "暫無明確方向性因素";
  }, [scores, aiAnalysis]);

  // 雙時區
  const usTime = currentTime.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const usDate = currentTime.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "2-digit", day: "2-digit" });

  const tabStyle = (tab) => ({
    padding: "10px 20px", fontSize: 13, fontWeight: 600,
    background: activeTab === tab ? "#1e293b" : "transparent",
    color: activeTab === tab ? "#e2e8f0" : S.dim,
    border: "none", cursor: "pointer",
    borderBottom: activeTab === tab ? `2px solid ${signal.color}` : "2px solid transparent",
    transition: "all 0.2s ease", ...S.mono, letterSpacing: 0.5
  });

  // ─── Render ─────────────────────────────────────────────────────
  return (
    <div style={{
      background: "#020617", minHeight: "100vh", color: "#e2e8f0",
      fontFamily: "'Noto Sans TC', 'Segoe UI', sans-serif",
      opacity: animateIn ? 1 : 0, transition: "opacity 0.6s ease"
    }}>
      {/* Google Fonts loaded in index.html */}

      {/* Header */}
      <div style={{
        background: "linear-gradient(180deg, #0f172a 0%, #020617 100%)",
        borderBottom: "1px solid #1e293b", padding: "16px 24px",
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: `linear-gradient(135deg, ${signal.color}40, ${signal.color}10)`,
            display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${signal.color}30`, fontSize: 18
          }}>⚡</div>
          <div>
            <div style={{
              fontSize: 18, fontWeight: 800, letterSpacing: 1, ...S.mono,
              background: `linear-gradient(135deg, ${signal.color}, #e2e8f0)`,
              WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent"
            }}>台指期 AI 交易輔助系統</div>
            <div style={{ fontSize: 11, color: S.dimmer, ...S.mono, display: "flex", gap: 8, alignItems: "center" }}>
              <span>v5 計分模型</span>
              <span style={{
                padding: "1px 6px", borderRadius: 3, fontSize: 9,
                background: apiStatus === "online" ? "rgba(74,222,128,0.15)" : "rgba(251,146,60,0.15)",
                color: apiStatus === "online" ? S.green : "#fb923c"
              }}>{apiStatus === "online" ? "● 即時" : "● 離線（模擬資料）"}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 20, alignItems: "flex-end" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: S.dimmer, ...S.mono, marginBottom: 2 }}>🇺🇸 美東 ET · {usDate}</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: S.gray, ...S.mono }}>{usTime}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 10, color: S.dimmer, ...S.mono, marginBottom: 2 }}>🇹🇼 台灣 · {currentTime.toLocaleDateString("zh-TW", { month: "2-digit", day: "2-digit" })}</div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "#e2e8f0", ...S.mono }}>{currentTime.toLocaleTimeString("zh-TW", { hour12: false })}</div>
          </div>
        </div>
      </div>

      {/* Tab Bar */}
      <div style={{ display: "flex", borderBottom: "1px solid #1e293b", background: "#0a0f1a", padding: "0 24px", overflowX: "auto" }}>
        {[["dashboard","總覽"],["ai","AI 分析"],["positions","帳戶部位"],["rules","規則設定"],["signals","訊號紀錄"]].map(([k,v]) => (
          <button key={k} style={tabStyle(k)} onClick={() => setActiveTab(k)}>{v}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "20px 24px", maxWidth: 1440, margin: "0 auto" }}>

        {activeTab === "dashboard" && (<>
          <SignalBanner signal={signal} finalScore={finalScore} filter={filter} mainReasons={mainReasons} />
          <SuggestionPanel action={action} signal={signal} />

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
            <div style={S.panel}>
              <div style={S.panelHeader}>v5 模型分數 · Model Scores</div>
              <div style={{ padding: "16px 16px 8px" }}>
                {scoreBarData.map((s, i) => <ScoreBar key={i} {...s} />)}
                <div style={{ marginTop: 8, padding: "12px", background: "#1e293b", borderRadius: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 13, color: S.gray, ...S.mono }}>加權綜合分數</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: signal.color, ...S.mono }}>{finalScore > 0 ? "+" : ""}{finalScore.toFixed(1)}</span>
                </div>
              </div>
            </div>
            <div style={S.panel}>
              <div style={S.panelHeader}>市場觀察 · Market Watch</div>
              <div>{market.map((item, i) => <MarketRow key={i} item={item} />)}</div>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1.4fr 0.6fr", gap: 20 }}>
            <div style={S.panel}>
              <div style={S.panelHeader}>重要新聞 · Key News</div>
              <div style={{ padding: 16 }}>{news.map(item => <NewsCard key={item.id} item={item} />)}</div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              <PositionSummary positions={positions} brokerConnected={brokerConnected} />
              <div style={{ ...S.panel, flex: 1 }}>
                <div style={{ ...S.panelHeader, display: "flex", justifyContent: "space-between" }}>
                  <span>規則狀態 · Rules</span>
                  <span style={{ color: S.green, fontSize: 11 }}>進場 {entryRulesMet}/{totalEntryRules} · 風控 {riskRulesMet}/{totalRiskRules}</span>
                </div>
                <div>
                  {rules.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderBottom: "1px solid #1e293b", fontSize: 13 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: r.status ? S.green : "#334155", boxShadow: r.status ? "0 0 6px rgba(74,222,128,0.5)" : "none", flexShrink: 0 }} />
                      <span style={{ color: r.status ? "#e2e8f0" : S.dim, flex: 1 }}>{r.name}</span>
                      <span style={{ fontSize: 11, color: r.status ? S.green : S.dim, ...S.mono }}>{r.status ? "✓" : "✗"}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>)}

        {/* ─── AI 分析頁 ─── */}
        {activeTab === "ai" && (
          <div style={S.panel}>
            <div style={{ ...S.panelHeader, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>AI 分析結論 · AI Analysis</span>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                {aiAnalysis && (
                  <span style={{ fontSize: 10, color: S.dimmer }}>
                    {aiAnalysis.source === "claude_api" ? "Claude API" : "規則引擎"} · {aiAnalysis.generatedAt || ""}
                  </span>
                )}
                <button onClick={refreshAI} disabled={aiLoading} style={{
                  padding: "4px 12px", fontSize: 11, borderRadius: 4, border: "1px solid #334155",
                  background: aiLoading ? "#1e293b" : "#0f172a", color: aiLoading ? S.dimmer : S.green,
                  cursor: aiLoading ? "wait" : "pointer", ...S.mono
                }}>{aiLoading ? "分析中..." : "重新分析"}</button>
              </div>
            </div>
            <div style={{ padding: 20 }}>
              {!aiAnalysis ? (
                <div style={{ textAlign: "center", padding: 40, color: S.dim }}>
                  <div style={{ fontSize: 14, marginBottom: 8 }}>尚未取得 AI 分析</div>
                  <div style={{ fontSize: 12, color: S.dimmer }}>請啟動後端或點擊「重新分析」</div>
                </div>
              ) : (
                <>
                  {/* 結論 */}
                  <div style={{
                    padding: "16px 20px", marginBottom: 20, borderRadius: 8,
                    background: signal.bg, border: `1px solid ${signal.color}30`
                  }}>
                    <div style={{ fontSize: 11, color: S.dim, marginBottom: 6, ...S.mono }}>AI 結論</div>
                    <div style={{ fontSize: 16, fontWeight: 600, color: "#e2e8f0", lineHeight: 1.6 }}>
                      {aiAnalysis.conclusion}
                    </div>
                    <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center" }}>
                      <span style={{
                        padding: "4px 14px", borderRadius: 6, fontSize: 13, fontWeight: 700,
                        background: signal.bg, color: signal.color, border: `1px solid ${signal.color}40`, ...S.mono
                      }}>{aiAnalysis.direction}</span>
                      <span style={{ fontSize: 12, color: S.dim, ...S.mono }}>
                        信心度 {Math.round((aiAnalysis.confidence || 0) * 100)}%
                      </span>
                    </div>
                  </div>

                  {/* 主要原因 + 風險 */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
                    <div style={{ background: "#0f172a", borderRadius: 8, border: "1px solid #1e293b", padding: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: S.green, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 4, height: 14, background: S.green, borderRadius: 2 }} />
                        主要原因
                      </div>
                      {(aiAnalysis.reasons || []).map((r, i) => (
                        <div key={i} style={{ padding: "8px 0", borderBottom: i < (aiAnalysis.reasons || []).length - 1 ? "1px solid #1e293b" : "none", fontSize: 13, color: "#e2e8f0", lineHeight: 1.5 }}>
                          {i + 1}. {r}
                        </div>
                      ))}
                    </div>
                    <div style={{ background: "#0f172a", borderRadius: 8, border: "1px solid #1e293b", padding: 16 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#fbbf24", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 4, height: 14, background: "#fbbf24", borderRadius: 2 }} />
                        風險提醒
                      </div>
                      {(aiAnalysis.warnings || []).map((w, i) => (
                        <div key={i} style={{ padding: "8px 0", borderBottom: i < (aiAnalysis.warnings || []).length - 1 ? "1px solid #1e293b" : "none", fontSize: 13, color: "#fbbf24", lineHeight: 1.5 }}>
                          ⚠ {w}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 建議操作 */}
                  {aiAnalysis.suggestion && (
                    <div style={{ background: "#0f172a", borderRadius: 8, border: `1px solid ${signal.color}20`, padding: 16, marginBottom: 20 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: signal.color, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 4, height: 14, background: signal.color, borderRadius: 2 }} />
                        建議操作
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
                        {[
                          { label: "動作", value: aiAnalysis.suggestion.action },
                          { label: "時機", value: aiAnalysis.suggestion.timing },
                          { label: "停損", value: aiAnalysis.suggestion.stopLoss },
                          { label: "停利", value: aiAnalysis.suggestion.takeProfit },
                          { label: "口數", value: aiAnalysis.suggestion.size },
                        ].map((it, i) => (
                          <div key={i}>
                            <div style={{ fontSize: 10, color: S.dimmer, marginBottom: 2, ...S.mono }}>{it.label}</div>
                            <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 500 }}>{it.value || "-"}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 新聞重點 + 市場背景 + 時段提醒 */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                    {[
                      { title: "新聞重點", content: aiAnalysis.newsHighlight, color: "#60a5fa" },
                      { title: "市場背景", content: aiAnalysis.marketContext, color: "#a78bfa" },
                      { title: "時段提醒", content: aiAnalysis.sessionNote, color: "#fb923c" },
                    ].map((card, i) => (
                      <div key={i} style={{ background: "#0f172a", borderRadius: 8, border: "1px solid #1e293b", padding: 14 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: card.color, marginBottom: 8, ...S.mono }}>{card.title}</div>
                        <div style={{ fontSize: 12, color: S.gray, lineHeight: 1.6 }}>{card.content || "-"}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* 帳戶部位頁 */}
        {activeTab === "positions" && (
          <div style={S.panel}>
            <div style={S.panelHeader}>帳戶部位詳情 · Account & Positions</div>
            <div style={{ padding: 20 }}>
              {!brokerConnected && (
                <div style={{ marginBottom: 16, padding: "10px 14px", background: "rgba(251,146,60,0.08)", border: "1px solid rgba(251,146,60,0.2)", borderRadius: 8, fontSize: 12, color: "#fb923c" }}>
                  ⚠ 永豐金 API 尚未接入。以下為模擬資料，請手動操作下單。
                </div>
              )}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 24 }}>
                {[
                  { label: "帳戶", value: brokerConnected ? "永豐金 ****1234" : "尚未連接", color: "#e2e8f0" },
                  { label: "可用保證金", value: "$128,400", color: "#60a5fa" },
                  { label: "未實現損益", value: fmtInt(positions.reduce((s, p) => s + (p.unrealizedPnl || 0), 0)) + " 元", color: S.green },
                  { label: "今日已實現", value: "+2,340 元", color: S.green },
                  { label: "今日交易次數", value: "3 次", color: S.gray },
                  { label: "今日累計損益", value: "+3,920 元", color: S.green },
                ].map((it, i) => (
                  <div key={i} style={{ background: "#1e293b", padding: "14px 16px", borderRadius: 8 }}>
                    <div style={{ fontSize: 10, color: S.dim, marginBottom: 4, ...S.mono }}>{it.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: it.color, ...S.mono }}>{it.value}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11, color: S.dim, marginBottom: 8, ...S.mono, letterSpacing: 1 }}>未平倉部位</div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ borderBottom: "2px solid #1e293b" }}>
                    {["商品","方向","口數","均價","現價","未實現損益","系統建議"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: S.dim, fontSize: 11, ...S.mono, fontWeight: 600 }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {positions.map((p, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid #1e293b" }}>
                        <td style={{ padding: 12, fontWeight: 600 }}>{p.symbol}</td>
                        <td style={{ padding: 12 }}><span style={{ color: p.direction === "long" ? S.green : S.red, ...S.mono, fontWeight: 700 }}>{p.direction === "long" ? "多單" : "空單"}</span></td>
                        <td style={{ padding: 12, ...S.mono }}>{p.qty}</td>
                        <td style={{ padding: 12, ...S.mono }}>{p.avgCost.toLocaleString()}</td>
                        <td style={{ padding: 12, ...S.mono, fontWeight: 600 }}>{p.marketPrice.toLocaleString()}</td>
                        <td style={{ padding: 12, ...S.mono, fontWeight: 700, color: p.unrealizedPnl >= 0 ? S.green : S.red }}>{fmtInt(p.unrealizedPnl)} 元</td>
                        <td style={{ padding: 12 }}><span style={{ padding: "4px 10px", borderRadius: 4, background: "rgba(74,222,128,0.1)", color: S.green, fontSize: 12, fontWeight: 600 }}>{action.direction === "觀望" ? "觀望" : `${action.direction}`}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ fontSize: 11, color: S.dim, margin: "24px 0 8px", ...S.mono, letterSpacing: 1 }}>掛單中</div>
              <div style={{ padding: 16, background: "#1e293b", borderRadius: 8, color: S.dimmer, fontSize: 13, textAlign: "center" }}>目前無掛單</div>
            </div>
          </div>
        )}

        {/* 規則設定頁 */}
        {activeTab === "rules" && (
          <div style={S.panel}>
            <div style={S.panelHeader}>規則引擎設定 · Rule Engine</div>
            <div style={{ padding: 20 }}>
              {["entry","exit","risk","block"].map(type => {
                const tLabel = { entry: "進場規則", exit: "出場規則", risk: "風控規則", block: "禁單規則" }[type];
                const tColor = { entry: S.green, exit: "#60a5fa", risk: "#fbbf24", block: S.red }[type];
                const indices = rules.reduce((a, r, i) => r.type === type ? [...a, i] : a, []);
                const filtered = indices.map(i => rules[i]);
                return (
                  <div key={type} style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: tColor, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 4, height: 16, background: tColor, borderRadius: 2 }} />
                      {tLabel}
                      <span style={{ fontSize: 11, color: S.dimmer, fontWeight: 400 }}>({filtered.filter(r => r.status).length}/{filtered.length} 成立)</span>
                    </div>
                    <div style={{ background: "#0f172a", borderRadius: 8, border: "1px solid #1e293b" }}>
                      {filtered.map((r, j) => (
                        <div key={j} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: j < filtered.length - 1 ? "1px solid #1e293b" : "none" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{ width: 10, height: 10, borderRadius: "50%", background: r.status ? S.green : "#334155", boxShadow: r.status ? "0 0 8px rgba(74,222,128,0.4)" : "none" }} />
                            <span style={{ fontSize: 13, color: r.status ? "#e2e8f0" : S.dim }}>{r.name}</span>
                          </div>
                          <div onClick={() => toggleRule(indices[j])} style={{
                            width: 40, height: 22, borderRadius: 11, cursor: "pointer",
                            background: r.status ? S.green : "#334155", position: "relative", transition: "background 0.2s"
                          }}>
                            <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 2, left: r.status ? 20 : 2, transition: "left 0.2s" }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <div style={{ padding: "12px 16px", background: "rgba(96,165,250,0.08)", border: "1px solid rgba(96,165,250,0.2)", borderRadius: 8, fontSize: 12, color: "#60a5fa" }}>
                💡 規則引擎支援自訂條件組合。完整版將提供圖形化規則編輯器。切換規則會即時影響訊號過濾與建議動作。
              </div>
            </div>
          </div>
        )}

        {/* 訊號紀錄頁 */}
        {activeTab === "signals" && (
          <div style={S.panel}>
            <div style={S.panelHeader}>訊號紀錄 · Signal History</div>
            <div style={{ padding: 20, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead><tr style={{ borderBottom: "2px solid #1e293b" }}>
                  {HISTORY_HEADERS.map(h => (
                    <th key={h} style={{ padding: "10px 8px", textAlign: "center", color: S.dim, fontSize: 10, ...S.mono, fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {signalHistory.map((row, i) => {
                    const f = computeFinalScore(row.scores);
                    const sig = getSignalLevel(f);
                    return (
                      <tr key={i} style={{ borderBottom: "1px solid #1e293b" }}>
                        <td style={{ padding: 8, ...S.mono, fontSize: 11, color: S.gray, whiteSpace: "nowrap" }}>{row.time}</td>
                        {HISTORY_KEYS.map(k => {
                          const v = row.scores[k] || 0;
                          return <td key={k} style={{ padding: "8px 6px", textAlign: "center", ...S.mono, fontSize: 11, color: v >= 0 ? S.green : S.red }}>{v >= 0 ? "+" : ""}{v}</td>;
                        })}
                        <td style={{ padding: 8, textAlign: "center", ...S.mono, fontSize: 13, fontWeight: 800, color: sig.color }}>{f > 0 ? "+" : ""}{f.toFixed(1)}</td>
                        <td style={{ padding: 8, textAlign: "center", fontSize: 10, ...S.mono, color: sig.color }}>{sig.level}</td>
                        <td style={{ padding: 8, textAlign: "center", fontSize: 11, ...S.mono, color: row.result.includes("+") ? S.green : S.gray }}>{row.result}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop: 24, padding: "16px 0", borderTop: "1px solid #1e293b", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: "#334155", ...S.mono }}>
          <span>
            {apiStatus === "online" ? "即時資料" : "模擬資料"} · 第一階段
            {lastUpdate && ` · 最後更新 ${lastUpdate.toLocaleTimeString("zh-TW", { hour12: false })}`}
          </span>
          <span>台指期 AI 交易輔助系統 v5</span>
        </div>
      </div>
    </div>
  );
}
