import { useEffect, useMemo, useRef, useState } from 'react';
import { Doughnut, Bar } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);

const STORAGE_KEY = 'receipt-ledger-records';
const categories = ['食費', '日用品', '外食', '交通費', '医療費', 'その他'];
const colors = ['#e67e52', '#3f8f83', '#d9a441', '#5976a8', '#ba6570', '#8b8178'];
const sampleRecords = [
  { id: 'sample-1', store: '成城ストア', date: '2026-08-17', items: [{ name: '旬の野菜セット', amount: 1280, category: '食費' }, { name: 'キッチンペーパー', amount: 398, category: '日用品' }] },
  { id: 'sample-2', store: '駅前カフェ', date: '2026-08-12', items: [{ name: 'ランチプレート', amount: 1450, category: '外食' }] },
  { id: 'sample-3', store: '日々商店', date: '2026-07-24', items: [{ name: '旬の野菜セット', amount: 980, category: '食費' }, { name: '洗濯洗剤', amount: 628, category: '日用品' }] },
];

const yen = (value) => new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY', maximumFractionDigits: 0 }).format(value);
const initialRecords = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || sampleRecords; } catch { return sampleRecords; } };
const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;

function App() {
  const [records, setRecords] = useState(initialRecords);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [message, setMessage] = useState('');
  const [showLowest, setShowLowest] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editing, setEditing] = useState(null);
  const [draft, setDraft] = useState(null);
  const fileInput = useRef(null);

  useEffect(() => localStorage.setItem(STORAGE_KEY, JSON.stringify(records)), [records]);

  const items = useMemo(() => records.flatMap((record) => record.items.map((item) => ({ ...item, date: record.date, store: record.store }))), [records]);
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  const categoryTotals = categories.map((category) => items.filter((item) => item.category === category).reduce((sum, item) => sum + item.amount, 0));
  const monthlyTotals = [...new Set(records.map((record) => record.date.slice(0, 7)))].sort().map((month) => ({ month, total: items.filter((item) => item.date.startsWith(month)).reduce((sum, item) => sum + item.amount, 0) }));
  const lowestPrices = Object.values(items.reduce((result, item) => { if (!result[item.name] || item.amount < result[item.name].amount) result[item.name] = item; return result; }, {}));

  function isDuplicate(receipt) {
    return receipt.items.some((newItem) => records.some((record) => record.date === receipt.date && record.store === receipt.store && record.items.some((item) => item.name === newItem.name)));
  }

  function selectFile(file) {
    if (file) analyzeReceipt(file);
  }

  function handleDrop(event) {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files?.[0]);
  }

  async function analyzeReceipt(file) {
    if (!file) return;
    setIsAnalyzing(true); setMessage('Claudeがレシートを読み取っています…');
    const formData = new FormData(); formData.append('receipt', file);
    try {
      const response = await fetch('/api/analyze-receipt', { method: 'POST', body: formData });
      const responseText = await response.text();
      let data;
      try { data = JSON.parse(responseText); } catch { data = {}; }
      if (!response.ok) throw new Error(data.error || '解析に失敗しました。');
      if (isDuplicate(data) && !window.confirm(`同じ日時・店舗・商品名のデータが読み込み済みです。\n\n${data.date} / ${data.store}\n登録を続けますか？`)) {
        setMessage('重複データは登録しませんでした。');
        return;
      }
      setRecords((current) => [{ ...data, id: newId() }, ...current]);
      setMessage(`${data.store}のレシートを登録しました。`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'レシートの読み込みに失敗しました。');
    } finally {
      setIsAnalyzing(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function startEdit(record, itemIndex) {
    setEditing({ recordId: record.id, itemIndex });
    setDraft({ date: record.date, store: record.store, ...record.items[itemIndex] });
  }

  function addItem(record) {
    const itemIndex = record.items.length;
    setRecords((current) => current.map((currentRecord) => currentRecord.id === record.id
      ? { ...currentRecord, items: [...currentRecord.items, { name: '', amount: 0, category: 'その他' }] }
      : currentRecord));
    setEditing({ recordId: record.id, itemIndex, isNew: true });
    setDraft({ date: record.date, store: record.store, name: '', amount: '', category: 'その他' });
  }

  function cancelEdit() {
    if (editing?.isNew) {
      setRecords((current) => current.flatMap((record) => {
        if (record.id !== editing.recordId) return [record];
        const itemsAfterCancel = record.items.filter((_item, index) => index !== editing.itemIndex);
        return itemsAfterCancel.length ? [{ ...record, items: itemsAfterCancel }] : [];
      }));
    }
    setEditing(null); setDraft(null);
  }

  function saveEdit() {
    if (!draft?.date || !draft.store || !draft.name || Number(draft.amount) < 0) {
      setMessage('日付、店舗名、商品名、金額を入力してください。');
      return;
    }
    setRecords((current) => current.map((record) => {
      if (record.id !== editing.recordId) return record;
      return { ...record, date: draft.date, store: draft.store, items: record.items.map((item, index) => index === editing.itemIndex ? { name: draft.name, amount: Number(draft.amount), category: draft.category } : item) };
    }));
    setEditing(null); setDraft(null); setMessage(editing.isNew ? '行を追加しました。グラフも再集計されています。' : 'データを修正しました。グラフも再集計されています。');
  }

  function deleteItem(recordId, itemIndex) {
    if (!window.confirm('この購入品データを削除しますか？')) return;
    setRecords((current) => current.flatMap((record) => {
      if (record.id !== recordId) return [record];
      const itemsAfterDelete = record.items.filter((_item, index) => index !== itemIndex);
      return itemsAfterDelete.length ? [{ ...record, items: itemsAfterDelete }] : [];
    }));
    setMessage('データを削除しました。グラフも再集計されています。');
  }

  return <div className="app-shell">
    <header className="topbar"><div className="brand-mark">RL</div><div><p className="eyebrow">PERSONAL FINANCE / 2026</p><h1>Receipt Ledger</h1></div><div className="header-stat"><span>今月の支出</span><strong>{yen(monthlyTotals.at(-1)?.total || 0)}</strong></div></header>
    <main>
      <section className="hero"><div><p className="eyebrow accent">レシートから、暮らしの輪郭を。</p><h2>買い物を記録して、<br /><em>お金の流れ</em>を眺める。</h2><p className="hero-copy">画像をアップロードするだけで、購入品を自動で整理。いつもの支出を、静かに見える化します。</p></div><div className={`drop-zone ${isDragging ? 'dragging' : ''}`} onDragEnter={(event) => { event.preventDefault(); setIsDragging(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}><button className="upload-button" onClick={() => fileInput.current?.click()} disabled={isAnalyzing}><span className="upload-icon">{isAnalyzing ? '…' : '＋'}</span><span>{isAnalyzing ? '読み取り中' : 'レシートを読み込む'}</span><small>クリックまたは画像をドロップ / JPG・PNG・WEBP</small></button><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/gif" hidden onChange={(event) => selectFile(event.target.files?.[0])} /></div></section>
      {message && <p className="notice">{message}</p>}
      <section className="summary-grid"><div className="summary-card highlight"><span>累計支出</span><strong>{yen(total)}</strong><small>{records.length}件のレシート</small></div><div className="summary-card"><span>購入アイテム</span><strong>{items.length}<small>点</small></strong><small>自動でカテゴリ分類済み</small></div><div className="summary-card"><span>よく使うカテゴリ</span><strong>{categories[categoryTotals.indexOf(Math.max(...categoryTotals))]}</strong><small>{yen(Math.max(...categoryTotals))}</small></div></section>
      <section className="dashboard-grid"><div className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">BREAKDOWN</p><h3>カテゴリ別の支出</h3></div><span className="panel-unit">円</span></div><div className="donut-wrap">{total ? <Doughnut data={{ labels: categories, datasets: [{ data: categoryTotals, backgroundColor: colors, borderWidth: 0 }] }} options={{ cutout: '70%', plugins: { legend: { display: false } } }} /> : <p>データがありません</p>}<div className="donut-center"><strong>{yen(total)}</strong><span>合計</span></div></div><div className="legend-grid">{categories.map((category, index) => <div className="legend-item" key={category}><i style={{ backgroundColor: colors[index] }} /><span>{category}</span><b>{yen(categoryTotals[index])}</b></div>)}</div></div><div className="panel chart-panel"><div className="panel-heading"><div><p className="eyebrow">MONTHLY VIEW</p><h3>月別の支出</h3></div><span className="panel-unit">円</span></div><div className="bar-wrap"><Bar data={{ labels: monthlyTotals.map((entry) => entry.month.replace('-', '.')), datasets: [{ data: monthlyTotals.map((entry) => entry.total), backgroundColor: '#3f8f83', borderRadius: 3, barThickness: 24 }] }} options={{ responsive: true, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#ebe5db' }, ticks: { callback: (value) => `${Number(value).toLocaleString()}円` } }, x: { grid: { display: false } } } }} /></div></div></section>
      <section className="panel records-panel"><div className="panel-heading records-heading"><div><p className="eyebrow">TRANSACTIONS</p><h3>読み込み履歴</h3><small className="panel-hint">読み取り結果は行ごとに修正・削除できます</small></div><button className={`lowest-button ${showLowest ? 'active' : ''}`} onClick={() => setShowLowest((value) => !value)}>⌁ 最安値を表示</button></div>{showLowest ? <div className="lowest-list">{lowestPrices.map((item) => <div className="lowest-row" key={item.name}><span>{item.name}</span><span>{item.date} / {item.store}</span><strong>{yen(item.amount)}</strong></div>)}</div> : <div className="table-wrap"><table><thead><tr><th>日付</th><th>店舗</th><th>購入品</th><th>カテゴリ</th><th className="amount">金額</th><th>操作</th></tr></thead><tbody>{records.flatMap((record) => [...record.items.map((item, index) => { const isEditing = editing?.recordId === record.id && editing.itemIndex === index; return <tr key={`${record.id}-${index}`}>{isEditing ? <><td><input className="edit-input" type="date" value={draft.date} onChange={(event) => setDraft({ ...draft, date: event.target.value })} /></td><td><input className="edit-input" value={draft.store} onChange={(event) => setDraft({ ...draft, store: event.target.value })} /></td><td><input className="edit-input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></td><td><select className="edit-input" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select></td><td className="amount"><input className="edit-input amount-input" type="number" min="0" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} /></td><td className="actions"><button className="row-button save" onClick={saveEdit}>保存</button><button className="row-button" onClick={cancelEdit}>取消</button></td></> : <><td>{record.date}</td><td>{record.store}</td><td>{item.name}</td><td><span className="category-tag">{item.category}</span></td><td className="amount">{yen(item.amount)}</td><td className="actions"><button className="row-button" onClick={() => startEdit(record, index)}>編集</button><button className="row-button delete" onClick={() => deleteItem(record.id, index)}>削除</button></td></>}</tr>; }), <tr className="add-row" key={`${record.id}-add`}><td colSpan="6"><button className="add-row-button" onClick={() => addItem(record)}>＋ 行を追加</button></td></tr>])}</tbody></table></div>}</section>
    </main><footer>Receipt Ledger <span>あなたの支出データは、このブラウザに保存されます。</span></footer>
  </div>;
}

export default App;
