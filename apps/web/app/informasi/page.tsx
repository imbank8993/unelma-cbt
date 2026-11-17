'use client';

import Link from 'next/link';
import { ArrowLeft, FileText, FolderOpen, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { getPublicInformation, informationLink, type InformationList } from '@/lib/information-api';

export default function PublicInformationPage() {
  const [data, setData] = useState<InformationList>({ folders: [], documents: [] });
  const [folderId, setFolderId] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setFolderId(new URLSearchParams(window.location.search).get('folder') || '');
    void getPublicInformation().then(result => {
      if (!active) return;
      if (result.success) setData({ folders: result.folders, documents: result.documents });
      else setError(result.error);
      setLoading(false);
    });
    return () => { active = false; };
  }, []);
  const visible = useMemo(() => data.documents.filter(doc =>
    (!folderId || doc.folder_id === folderId) && doc.title.toLocaleLowerCase('id-ID').includes(query.toLocaleLowerCase('id-ID')),
  ), [data.documents, folderId, query]);

  return <main className="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 sm:py-14">
    <div className="mx-auto max-w-6xl">
      <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#030C4D]"><ArrowLeft size={16} /> Beranda</Link>
      <div className="mt-8 rounded-3xl bg-[#030C4D] p-7 text-white sm:p-10">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-300">Unelma Edu Indonesia</p>
        <h1 className="mt-2 text-3xl font-black">Informasi</h1>
        <p className="mt-2 text-sm text-slate-200">Pilih folder lalu baca dokumen PDF yang diterbitkan.</p>
      </div>
      <div className="mt-7 flex flex-wrap gap-2" aria-label="Folder informasi">
        <button type="button" onClick={() => setFolderId('')} aria-pressed={!folderId} className={`rounded-xl px-4 py-2 text-sm font-semibold ${!folderId ? 'bg-[#030C4D] text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}>Semua</button>
        {data.folders.map(folder => <button key={folder.id} type="button" onClick={() => setFolderId(folder.id)} aria-pressed={folderId === folder.id}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ${folderId === folder.id ? 'bg-[#030C4D] text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200'}`}><FolderOpen size={15} /> {folder.name}</button>)}
      </div>
      <label className="mt-6 flex max-w-md items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-500"><Search size={17} />
        <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Cari informasi…" className="w-full bg-transparent text-sm text-slate-900 outline-none" />
      </label>
      {loading ? <p className="mt-8 text-sm text-slate-500">Memuat informasi…</p> : error ? <p role="alert" className="mt-8 text-sm text-red-600">{error}</p> : visible.length ?
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{visible.map(doc => <Link key={doc.id} href={informationLink(doc.id)} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-[#030C4D]/40 hover:shadow-md">
          <FileText size={28} className="text-[#030C4D]" />
          <p className="mt-4 text-xs font-medium text-slate-500">{data.folders.find(folder => folder.id === doc.folder_id)?.name || 'Informasi'} · PDF</p>
          <h2 className="mt-1 font-bold text-slate-900">{doc.title}</h2>
          <p className="mt-3 text-xs text-slate-500">{new Date(doc.created_at).toLocaleDateString('id-ID')}</p>
        </Link>)}</div> : <p className="mt-8 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500">Belum ada PDF untuk pilihan ini.</p>}
    </div>
  </main>;
}
