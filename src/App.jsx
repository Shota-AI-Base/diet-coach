import { useState, useRef, useEffect } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const TRIAL_DAYS = 7;

const SYSTEM_PROMPT = `あなたは「AIダイエットコーチ」です。ユーザーが90kgから78kgへの減量に成功した実体験をベースに設計されています。

【コーチングの5原則】
1. 朝食は固定メニューで習慣化
2. 昼食はAIのアドバイス通りに食べる
3. 夕食は炭水化物控えめ＋お酒を減らす
4. 意識して一歩でもいいから歩く。歩数より「歩く意識」を持つことが大切
5. できなかった日があっても自分を責めない。次の日に調整すればいい

【スタイル】
- 毎日の記録に対して必ずポジティブなフィードバックをする
- 難しい食事制限は勧めない。シンプルに「摂取カロリー < 消費カロリー」を徹底
- 歩数を増やすことと軽い筋トレを推奨。ハードなトレーニングは不要
- できなかった日を責めず、次の日への切り替えを積極的に促す
- 友達のような温かいトーン。日本語で話す
- ユーザーが初めてなら身長・体重・年齢・目標体重を聞く
- 情報が揃ったら1日の目標カロリーと具体的な食事プランを提案する`;

const REPORT_PROMPT = (logs) => `以下は過去1週間のダイエット記録です。この記録をもとに、励ましと具体的な改善アドバイスを含む週次レポートを日本語で作成してください。できなかった日があっても責めず、次の日への切り替えを促す温かいトーンで。200文字程度で簡潔に。
記録: ${JSON.stringify(logs)}`;

const TABS = [
  { id: "chat", label: "コーチ", icon: "💬" },
  { id: "log", label: "記録", icon: "📊" },
  { id: "report", label: "レポート", icon: "📝" },
  { id: "profile", label: "設定", icon: "⚙️" },
];

function loadState(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function saveState(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

export default function App() {
  const startDate = loadState("trialStart", null);
  const [trialStart] = useState(() => {
    if (startDate) return startDate;
    const now = Date.now();
    saveState("trialStart", now);
    return now;
  });

  const trialDaysLeft = Math.max(0, TRIAL_DAYS - Math.floor((Date.now() - trialStart) / 86400000));
  const isLocked = trialDaysLeft === 0;

  const [tab, setTab] = useState("chat");
  const [messages, setMessages] = useState(() => loadState("messages", [{
    role: "assistant",
    content: "こんにちは！🌱 AIダイエットコーチです。\n\n難しいことは何もありません。一歩ずつ、一緒に進みましょう。できない日があっても大丈夫。次の日に調整すればいいだけです。\n\nまず、あなたのことを教えてください👇\n① 身長（cm）\n② 現在の体重（kg）\n③ 年齢\n④ 目標体重（kg）",
  }]));
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState(() => loadState("weightLogs", []));
  const [weightInput, setWeightInput] = useState("");
  const [stepsInput, setStepsInput] = useState("");
  const [report, setReport] = useState(() => loadState("weeklyReport", ""));
  const [reportLoading, setReportLoading] = useState(false);
  const [profile, setProfile] = useState(() => loadState("profile", { name: "", height: "", startWeight: "", goalWeight: "", age: "" }));
  const [showPaywall, setShowPaywall] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { saveState("messages", messages); }, [messages]);
  useEffect(() => { saveState("weightLogs", logs); }, [logs]);
  useEffect(() => { saveState("weeklyReport", report); }, [report]);
  useEffect(() => { saveState("profile", profile); }, [profile]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  async function sendMessage() {
    if (!input.trim() || loading) return;
    if (isLocked) { setShowPaywall(true); return; }
    const userMsg = { role: "user", content: input.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: "claude-sonnet-4-20250514", max_tokens: 1000, system: SYSTEM_PROMPT, messages: updated }),
      });
      const data = await res.json();
      const reply = data.content?.find(b => b.type === "text")?.text || "少し待ってね…";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "エラーが発生しました。もう一度試してください。" }]);
    }
    setLoading(false);
  }

  function addLog() {
    if (!weightInput && !stepsInput) return;
    const entry = {
      date: new Date().toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }),
      weight: weightInput ? parseFloat(weightInput) : null,
      steps: stepsInput ? parseInt(stepsInput) : null,
      ts: Date.now(),
    };
    setLogs(prev => [entry, ...prev].slice(0, 30));
    setWeightInput("");
    setStepsInput("");
  }

  async function generateReport() {
    if (isLocked) { setShowPaywall(true); return; }
    if (logs.length === 0) return;
    setReportLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 1000,
          messages: [{ role: "user", content: REPORT_PROMPT(logs.slice(0, 7)) }],
        }),
      });
      const data = await res.json();
      setReport(data.content?.find(b => b.type === "text")?.text || "");
    } catch { setReport("レポートの生成に失敗しました。"); }
    setReportLoading(false);
  }

  const chartData = [...logs].reverse().filter(l => l.weight).map(l => ({ date: l.date, kg: l.weight }));
  const streak = logs.length;

  const C = {
    bg: "#0a0a0f",
    card: "rgba(255,255,255,0.04)",
    border: "rgba(255,255,255,0.08)",
    accent: "#a78bfa",
    accentDim: "rgba(167,139,250,0.15)",
    text: "#e2e8f0",
    muted: "#94a3b8",
    green: "#34d399",
    red: "#f87171"
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"'Hiragino Sans','Noto Sans JP',sans-serif",maxWidth:480,margin:"0 auto",display:"flex",flexDirection:"column",position:"relative"}}>

      {/* Paywall */}
      {showPaywall && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:100,display:"flex",alignItems:"center",justifyContent:"center",padding:24}}>
          <div style={{background:"#13131a",border:"1px solid rgba(167,139,250,0.3)",borderRadius:20,padding:32,maxWidth:360,width:"100%",textAlign:"center"}}>
            <div style={{fontSize:40,marginBottom:12}}>🔒</div>
            <div style={{fontSize:20,fontWeight:"bold",marginBottom:8}}>7日間無料トライアル終了</div>
            <div style={{fontSize:14,color:C.muted,lineHeight:1.7,marginBottom:24}}>
              AIコーチとの会話・週次レポートなど<br/>すべての機能を使い続けるには<br/>有料プランへのアップグレードが必要です。
            </div>
            <div style={{background:C.accentDim,border:"1px solid rgba(167,139,250,0.3)",borderRadius:14,padding:"20px 24px",marginBottom:20}}>
              <div style={{fontSize:13,color:C.accent,marginBottom:4}}>プレミアムプラン</div>
              <div style={{fontSize:36,fontWeight:"bold",color:"#fff"}}>¥980<span style={{fontSize:14,color:C.muted}}>/月</span></div>
              <div style={{fontSize:12,color:C.muted,marginTop:4}}>いつでもキャンセル可能</div>
            </div>
            <button onClick={() => window.open('https://buy.stripe.com/bJe14o3L9bGi7222Q60Ba05', '_blank')} style={{width:"100%",padding:"14px 0",borderRadius:12,background:"linear-gradient(135deg, #7c3aed, #a78bfa)",border:"none",color:"#fff",fontSize:15,fontWeight:"bold",cursor:"pointer",marginBottom:10}}>
              今すぐアップグレード
            </button>
            <button onClick={() => setShowPaywall(false)} style={{background:"none",border:"none",color:C.muted,fontSize:13,cursor:"pointer"}}>あとで</button>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{padding:"16px 20px 12px",borderBottom:`1px solid ${C.border}`,background:C.bg,position:"sticky",top:0,zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <div>
            <div style={{fontSize:11,color:C.accent,letterSpacing:"0.12em",textTransform:"uppercase"}}>AI Diet Coach</div>
            <div style={{fontSize:18,fontWeight:"bold"}}>毎日、一緒に続けよう。</div>
          </div>
          <div style={{textAlign:"right"}}>
            {isLocked ? (
              <button onClick={() => setShowPaywall(true)} style={{padding:"6px 14px",borderRadius:20,background:"linear-gradient(135deg, #7c3aed, #a78bfa)",border:"none",color:"#fff",fontSize:12,cursor:"pointer",fontWeight:"bold"}}>
                アップグレード
              </button>
            ) : (
              <div style={{background:C.accentDim,border:`1px solid rgba(167,139,250,0.3)`,borderRadius:20,padding:"4px 12px",textAlign:"center"}}>
                <div style={{fontSize:16,fontWeight:"bold",color:C.accent}}>{trialDaysLeft}日</div>
                <div style={{fontSize:9,color:C.muted}}>トライアル残り</div>
              </div>
            )}
          </div>
        </div>
        <div style={{display:"flex",gap:4,marginTop:12}}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{flex:1,padding:"7px 0",borderRadius:8,border:"none",background:tab===t.id?C.accentDim:"transparent",color:tab===t.id?C.accent:C.muted,fontSize:11,cursor:"pointer",transition:"all 0.15s",borderBottom:tab===t.id?`2px solid ${C.accent}`:"2px solid transparent"}}>
              <div>{t.icon}</div>
              <div style={{marginTop:2}}>{t.label}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Chat Tab */}
      {tab === "chat" && (
        <>
          <div style={{flex:1,overflowY:"auto",padding:"16px",display:"flex",flexDirection:"column",gap:14,maxHeight:"calc(100vh - 220px)"}}>
            {messages.map((m, i) => (
              <div key={i} style={{display:"flex",flexDirection:m.role==="user"?"row-reverse":"row",gap:8,alignItems:"flex-end"}}>
                {m.role === "assistant" && (
                  <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg, #4c1d95, #7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,flexShrink:0}}>🌿</div>
                )}
                <div style={{maxWidth:"78%",padding:"11px 14px",borderRadius:m.role==="user"?"16px 16px 4px 16px":"16px 16px 16px 4px",background:m.role==="user"?"linear-gradient(135deg, #5b21b6, #7c3aed)":C.card,border:m.role==="user"?"none":`1px solid ${C.border}`,fontSize:14,lineHeight:1.7,whiteSpace:"pre-wrap",color:C.text}}>
                  {m.content}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{display:"flex",gap:8,alignItems:"flex-end"}}>
                <div style={{width:30,height:30,borderRadius:"50%",background:"linear-gradient(135deg, #4c1d95, #7c3aed)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14}}>🌿</div>
                <div style={{padding:"11px 14px",borderRadius:"16px 16px 16px 4px",background:C.card,border:`1px solid ${C.border}`}}>
                  <span style={{display:"inline-flex",gap:4}}>
                    {[0,1,2].map(d => <span key={d} style={{width:5,height:5,borderRadius:"50%",background:C.accent,display:"inline-block",animation:"blink 1.2s infinite",animationDelay:`${d*0.2}s`}} />)}
                  </span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <div style={{padding:"10px 16px 20px",borderTop:`1px solid ${C.border}`,background:C.bg}}>
            {isLocked ? (
              <button onClick={() => setShowPaywall(true)} style={{width:"100%",padding:"14px 0",borderRadius:12,background:"linear-gradient(135deg, #7c3aed, #a78bfa)",border:"none",color:"#fff",fontSize:14,fontWeight:"bold",cursor:"pointer"}}>
                🔒 続けるにはアップグレード ¥980/月
              </button>
            ) : (
              <div style={{display:"flex",gap:8}}>
                <textarea value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendMessage();}}}
                  placeholder="今日の食事や体調を話してみよう…" rows={1}
                  style={{flex:1,padding:"11px 14px",borderRadius:12,background:C.card,border:`1px solid ${C.border}`,color:C.text,fontSize:14,resize:"none",outline:"none",fontFamily:"inherit",lineHeight:1.5}} />
                <button onClick={sendMessage} disabled={loading||!input.trim()} style={{width:42,height:42,borderRadius:"50%",background:input.trim()?"linear-gradient(135deg, #5b21b6, #7c3aed)":C.card,border:"none",color:input.trim()?"#fff":C.muted,fontSize:16,cursor:"pointer",flexShrink:0,transition:"all 0.15s"}}>↑</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Log Tab */}
      {tab === "log" && (
        <div style={{flex:1,overflowY:"auto",padding:16}}>
          <div style={{display:"flex",gap:10,marginBottom:16}}>
            {[
              {label:"記録日数",value:streak,unit:"日",color:C.accent},
              {label:"最新体重",value:logs.find(l=>l.weight)?.weight??"—",unit:"kg",color:C.green},
              {label:"目標まで",value:profile.goalWeight&&logs.find(l=>l.weight)?(parseFloat(logs.find(l=>l.weight).weight)-parseFloat(profile.goalWeight)).toFixed(1):"—",unit:"kg",color:C.red}
            ].map((s,i) => (
              <div key={i} style={{flex:1,background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:"12px 10px",textAlign:"center"}}>
                <div style={{fontSize:20,fontWeight:"bold",color:s.color}}>{s.value}<span style={{fontSize:11}}>{s.unit}</span></div>
                <div style={{fontSize:10,color:C.muted,marginTop:2}}>{s.label}</div>
              </div>
            ))}
          </div>

          {chartData.length >= 2 && (
            <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:"16px 12px",marginBottom:16}}>
              <div style={{fontSize:12,color:C.muted,marginBottom:10}}>体重推移 (kg)</div>
              <ResponsiveContainer width="100%" height={120}>
                <LineChart data={chartData}>
                  <XAxis dataKey="date" tick={{fontSize:9,fill:C.muted}} axisLine={false} tickLine={false} />
                  <YAxis domain={["auto","auto"]} tick={{fontSize:9,fill:C.muted}} axisLine={false} tickLine={false} width={28} />
                  <Tooltip contentStyle={{background:"#13131a",border:`1px solid ${C.border}`,borderRadius:8,fontSize:12}} />
                  <Line type="monotone" dataKey="kg" stroke={C.accent} strokeWidth={2} dot={{fill:C.accent,r:3}} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:16,marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:"bold",color:C.accent,marginBottom:12}}>今日の記録</div>
            <div style={{display:"flex",gap:10,marginBottom:12}}>
              {[
                {label:"体重 (kg)",val:weightInput,set:setWeightInput,ph:"例: 75.5"},
                {label:"歩数",val:stepsInput,set:setStepsInput,ph:"例: 8000"}
              ].map((f,i) => (
                <div key={i} style={{flex:1}}>
                  <div style={{fontSize:11,color:C.muted,marginBottom:5}}>{f.label}</div>
                  <input type="number" value={f.val} onChange={e=>f.set(e.target.value)} placeholder={f.ph}
                    style={{width:"100%",padding:"9px 11px",borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`,color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}} />
                </div>
              ))}
            </div>
            <button onClick={addLog} style={{width:"100%",padding:"11px 0",borderRadius:10,background:"linear-gradient(135deg, #5b21b6, #7c3aed)",border:"none",color:"#fff",fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
              記録する ✓
            </button>
          </div>

          {logs.length > 0 && (
            <div>
              <div style={{fontSize:11,color:C.muted,marginBottom:8,letterSpacing:"0.08em"}}>記録履歴</div>
              {logs.slice(0,10).map((l,i) => (
                <div key={i} style={{padding:"10px 14px",borderRadius:10,marginBottom:6,background:C.card,border:`1px solid ${C.border}`,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div style={{fontSize:12,color:C.muted}}>{l.date}</div>
                  <div style={{display:"flex",gap:14}}>
                    {l.weight && <div style={{fontSize:13}}><span style={{color:C.muted,fontSize:11}}>体重 </span><span style={{color:C.green,fontWeight:"bold"}}>{l.weight}kg</span></div>}
                    {l.steps && <div style={{fontSize:13}}><span style={{color:C.muted,fontSize:11}}>歩数 </span>{Number(l.steps).toLocaleString()}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Report Tab */}
      {tab === "report" && (
        <div style={{flex:1,overflowY:"auto",padding:16}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:20,marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:"bold",color:C.accent,marginBottom:6}}>週次AIレポート</div>
            <div style={{fontSize:12,color:C.muted,lineHeight:1.6,marginBottom:16}}>
              過去7日間の記録をAIが分析。できた日もできなかった日も含めて、温かくフィードバックします。
            </div>
            <button onClick={generateReport} disabled={reportLoading||logs.length===0} style={{width:"100%",padding:"12px 0",borderRadius:10,background:isLocked?C.card:"linear-gradient(135deg, #5b21b6, #7c3aed)",border:isLocked?`1px solid ${C.border}`:"none",color:isLocked?C.muted:"#fff",fontSize:14,cursor:"pointer",fontFamily:"inherit"}}>
              {isLocked ? "🔒 有料プランで利用可能" : reportLoading ? "生成中…" : "レポートを生成する"}
            </button>
          </div>
          {report && (
            <div style={{background:"rgba(167,139,250,0.08)",border:"1px solid rgba(167,139,250,0.2)",borderRadius:14,padding:20}}>
              <div style={{fontSize:11,color:C.accent,marginBottom:10,letterSpacing:"0.08em"}}>📝 最新レポート</div>
              <div style={{fontSize:14,lineHeight:1.8,color:C.text}}>{report}</div>
            </div>
          )}
          {logs.length === 0 && (
            <div style={{textAlign:"center",color:C.muted,fontSize:14,marginTop:40}}>
              まず「記録」タブで体重を記録してください
            </div>
          )}
        </div>
      )}

      {/* Profile Tab */}
      {tab === "profile" && (
        <div style={{flex:1,overflowY:"auto",padding:16}}>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:20,marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:"bold",color:C.accent,marginBottom:16}}>プロフィール設定</div>
            {[
              {label:"お名前",key:"name",ph:"例: 翔太",type:"text"},
              {label:"身長 (cm)",key:"height",ph:"例: 175",type:"number"},
              {label:"開始時の体重 (kg)",key:"startWeight",ph:"例: 90",type:"number"},
              {label:"目標体重 (kg)",key:"goalWeight",ph:"例: 75",type:"number"},
              {label:"年齢",key:"age",ph:"例: 35",type:"number"},
            ].map(f => (
              <div key={f.key} style={{marginBottom:12}}>
                <div style={{fontSize:11,color:C.muted,marginBottom:5}}>{f.label}</div>
                <input type={f.type} value={profile[f.key]} onChange={e=>setProfile(p=>({...p,[f.key]:e.target.value}))} placeholder={f.ph}
                  style={{width:"100%",padding:"10px 12px",borderRadius:8,background:"rgba(255,255,255,0.06)",border:`1px solid ${C.border}`,color:C.text,fontSize:14,outline:"none",boxSizing:"border-box"}} />
              </div>
            ))}
          </div>
          <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:14,padding:20}}>
            <div style={{fontSize:13,fontWeight:"bold",marginBottom:12}}>プラン状況</div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
              <span style={{fontSize:13,color:C.muted}}>現在のプラン</span>
              <span style={{fontSize:13,color:isLocked?C.red:C.green,fontWeight:"bold"}}>
                {isLocked ? "トライアル終了" : `無料トライアル（残り${trialDaysLeft}日）`}
              </span>
            </div>
            {isLocked && (
              <button onClick={() => setShowPaywall(true)} style={{width:"100%",padding:"12px 0",borderRadius:10,background:"linear-gradient(135deg, #7c3aed, #a78bfa)",border:"none",color:"#fff",fontSize:14,cursor:"pointer",fontFamily:"inherit",fontWeight:"bold",marginTop:8}}>
                ¥980/月 でアップグレード
              </button>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes blink{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1)}}
        *{box-sizing:border-box}
        input::placeholder,textarea::placeholder{color:#475569}
        ::-webkit-scrollbar{width:3px}
        ::-webkit-scrollbar-thumb{background:rgba(167,139,250,.2);border-radius:2px}
      `}</style>
    </div>
  );
}
