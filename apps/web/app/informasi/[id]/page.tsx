'use client';

import Link from 'next/link';
import { ArrowLeft, ExternalLink, FileText } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api/client';
import { informationFileLink, type InformationDocument } from '@/lib/information-api';

export default function InformationPdfPage() {
  const { id } = useParams<{ id: string }>();
  const [document, setDocument] = useState<InformationDocument | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) return;
    let active = true;
    void apiGet<{ document: InformationDocument }>(`/api/information/${encodeURIComponent(id)}`).then(result => {
      if (!active) return;
      if (result.success) setDocument(result.document);
      else setError(result.error);
    });
    return () => { active = false; };
  }, [id]);
  return <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
    <div className="mx-auto max-w-6xl">
      <Link href="/informasi" className="inline-flex items-center gap-2 text-sm font-semibold text-[#030C4D]"><ArrowLeft size={16} /> Semua informasi</Link>
      {error ? <p role="alert" className="mt-8 rounded-xl bg-white p-6 text-red-600">{error}</p> : document ? <>
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3"><FileText className="text-[#030C4D]" /><div><h1 className="font-bold">{document.title}</h1><p className="text-xs text-slate-500">{document.file_name}</p></div></div>
          <a href={informationFileLink(id)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-[#030C4D] px-4 py-2 text-sm font-semibold text-white">Buka PDF <ExternalLink size={15} /></a>
        </div>
        <iframe title={`PDF ${document.title}`} src={informationFileLink(id)} className="mt-4 h-[75vh] min-h-[500px] w-full rounded-2xl border border-slate-200 bg-white" />
      </> : <p className="mt-8 text-sm text-slate-500">Memuat PDF…</p>}
    </div>
  </main>;
}
