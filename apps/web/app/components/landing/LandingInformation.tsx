'use client';

import Link from 'next/link';
import { ArrowRight, FileText, FolderOpen } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getPublicInformation, informationLink, type InformationDocument, type InformationFolder } from '@/lib/information-api';

export default function LandingInformation() {
  const [folders, setFolders] = useState<InformationFolder[]>([]);
  const [documents, setDocuments] = useState<InformationDocument[]>([]);

  useEffect(() => {
    let active = true;
    void getPublicInformation().then(result => {
      if (!active || !result.success) return;
      setFolders(result.folders);
      setDocuments(result.documents);
    });
    return () => { active = false; };
  }, []);

  const latest = documents.slice(0, 6);
  return <section id="informasi" className="bg-slate-50 py-16 sm:py-20">
    <div className="container mx-auto px-4 md:px-6">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-[#B66A13]">Informasi</span>
          <h2 className="mt-2 text-2xl font-black tracking-tight text-[#030C4D] sm:text-3xl">Dokumen dan informasi terbaru</h2>
          <p className="mt-2 text-sm text-slate-600">Baca pengumuman dan panduan resmi dalam format PDF.</p>
        </div>
        <Link href="/informasi" className="inline-flex items-center gap-2 rounded-xl border border-[#030C4D]/15 bg-white px-4 py-2.5 text-sm font-bold text-[#030C4D] hover:border-[#030C4D]">
          Semua informasi <ArrowRight size={16} />
        </Link>
      </div>
      {latest.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{latest.map(doc =>
        <Link key={doc.id} href={informationLink(doc.id)} className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-[#030C4D]/40 hover:shadow-md">
          <span className="mb-4 inline-flex rounded-xl bg-[#030C4D]/5 p-3 text-[#030C4D]"><FileText size={22} /></span>
          <span className="block text-xs font-semibold text-slate-500">{folders.find(folder => folder.id === doc.folder_id)?.name || 'Informasi'}</span>
          <h3 className="mt-1 line-clamp-2 font-bold text-slate-900 group-hover:text-[#030C4D]">{doc.title}</h3>
          <span className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-[#030C4D]">Baca PDF <ArrowRight size={14} /></span>
        </Link>)}</div> : <div className="flex items-center gap-3 rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-7 text-sm text-slate-500">
        <FolderOpen size={20} /> Informasi PDF akan tampil di sini setelah diterbitkan Admin.
      </div>}
    </div>
  </section>;
}
