'use client';

import Link from 'next/link';
import { ExternalLink, FileText, FolderOpen, Plus, UploadCloud } from 'lucide-react';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { ActionButton, ActionGroup } from '@/app/components/ui/actionbutton';
import { deleteConfirmDialog } from '@/lib/confirm-dialog';
import {
  createInformationFolder, deleteInformationDocument, deleteInformationFolder, getAdminInformation,
  informationFileLink, informationFolderLink, informationLink, renameInformationFolder, updateInformationDocument,
  uploadInformationDocument, type InformationDocument, type InformationList,
} from '@/lib/information-api';

const EMPTY: InformationList = { folders: [], documents: [] };

export default function AdminInformationPage() {
  const [data, setData] = useState<InformationList>(EMPTY);
  const [folderId, setFolderId] = useState('');
  const [folderName, setFolderName] = useState('');
  const [editingFolder, setEditingFolder] = useState('');
  const [editingDocument, setEditingDocument] = useState('');
  const [editName, setEditName] = useState('');
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const result = await getAdminInformation();
    if (result.success) {
      setData({ folders: result.folders, documents: result.documents });
      setFolderId(previous => result.folders.some(folder => folder.id === previous) ? previous : result.folders[0]?.id || '');
    } else setMessage({ error: true, text: result.error });
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function run(action: Promise<{ success: boolean; error?: string }>, successText: string) {
    setBusy(true); setMessage(null);
    try {
      const result = await action;
      if (!result.success) { setMessage({ error: true, text: result.error || 'Permintaan gagal.' }); return false; }
      setMessage({ error: false, text: successText });
      await load();
      return true;
    } finally { setBusy(false); }
  }

  async function copy(path: string) {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      setMessage({ error: false, text: 'Tautan disalin.' });
    } catch { setMessage({ error: true, text: 'Tautan belum dapat disalin. Buka halaman lalu salin alamatnya.' }); }
  }

  async function addFolder(event: FormEvent) {
    event.preventDefault();
    if (await run(createInformationFolder(folderName), 'Folder dibuat.')) setFolderName('');
  }
  async function saveFolder(event: FormEvent) {
    event.preventDefault();
    if (await run(renameInformationFolder(editingFolder, editName), 'Nama folder diperbarui.')) setEditingFolder('');
  }
  async function removeFolder(id: string) {
    if (!await deleteConfirmDialog('Hapus folder?', 'Folder harus kosong sebelum dihapus.')) return;
    await run(deleteInformationFolder(id), 'Folder dihapus.');
  }
  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!folderId || !file) return;
    if (file.size > 25 * 1024 * 1024 || !/\.pdf$/i.test(file.name)) {
      setMessage({ error: true, text: 'Pilih berkas PDF berukuran maksimum 25 MB.' }); return;
    }
    if (await run(uploadInformationDocument(folderId, title.trim() || file.name.replace(/\.pdf$/i, ''), file), 'PDF berhasil diunggah dan diterbitkan.')) {
      setFile(null); setTitle('');
      const input = document.getElementById('information-pdf-file') as HTMLInputElement | null;
      if (input) input.value = '';
    }
  }
  async function saveDocument(event: FormEvent) {
    event.preventDefault();
    if (await run(updateInformationDocument(editingDocument, { title: editName }), 'Judul informasi diperbarui.')) setEditingDocument('');
  }
  async function removeDocument(doc: InformationDocument) {
    if (!await deleteConfirmDialog('Hapus PDF?', `“${doc.title}” akan hilang dari halaman publik dan bucket R2.`)) return;
    await run(deleteInformationDocument(doc.id), 'PDF dihapus.');
  }

  const selected = data.folders.find(folder => folder.id === folderId);
  const documents = data.documents.filter(doc => doc.folder_id === folderId);
  return <main className="mx-auto max-w-7xl space-y-6 pb-16 text-slate-900">
    {message && <p role={message.error ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ${message.error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{message.text}</p>}
    {loading ? <p className="text-sm text-slate-500">Memuat informasi…</p> : <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <aside className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="font-bold">Folder informasi</h2>
        <form onSubmit={addFolder} className="mt-4 flex gap-2"><input value={folderName} onChange={event => setFolderName(event.target.value)} placeholder="Nama folder baru" maxLength={100} required
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" /><button disabled={busy} aria-label="Tambah folder" className="rounded-lg bg-[#030C4D] px-3 text-white disabled:opacity-50"><Plus size={17} /></button></form>
        <div className="mt-4 space-y-2">{data.folders.map(folder => <div key={folder.id} className={`rounded-xl border p-2 ${folderId === folder.id ? 'border-[#030C4D] bg-blue-50/40' : 'border-slate-200'}`}>
          {editingFolder === folder.id ? <form onSubmit={saveFolder} className="flex gap-1"><input value={editName} onChange={event => setEditName(event.target.value)} maxLength={100} required autoFocus className="min-w-0 flex-1 rounded-md border px-2 py-1 text-sm" />
            <button disabled={busy} className="text-xs font-bold text-[#030C4D]">Simpan</button><button type="button" onClick={() => setEditingFolder('')} className="text-xs text-slate-500">Batal</button></form> : <>
            <button type="button" onClick={() => setFolderId(folder.id)} className="flex w-full items-center gap-2 text-left text-sm font-semibold"><FolderOpen size={17} className="shrink-0 text-[#030C4D]" /><span className="min-w-0 flex-1 truncate">{folder.name}</span><span className="text-xs text-slate-400">{data.documents.filter(doc => doc.folder_id === folder.id).length}</span></button>
            <ActionGroup className="mt-2 justify-end border-t border-slate-100 pt-2">
              <ActionButton action="copy" tooltip={`Salin tautan folder ${folder.name}`} onClick={() => void copy(informationFolderLink(folder.id))} />
              <ActionButton action="edit" tooltip={`Ubah folder ${folder.name}`} onClick={() => { setEditingFolder(folder.id); setEditName(folder.name); }} />
              <ActionButton action="delete" tooltip={`Hapus folder ${folder.name}`} disabled={busy} onClick={() => void removeFolder(folder.id)} />
            </ActionGroup>
          </>}
        </div>)}</div>
      </aside>
      <div className="space-y-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-bold">Unggah PDF {selected ? `ke ${selected.name}` : ''}</h2>
            <Link href="/informasi" target="_blank" className="inline-flex items-center gap-2 text-sm font-semibold text-[#030C4D] hover:underline">Lihat halaman publik <ExternalLink size={15} /></Link>
          </div>
          <p className="mt-1 text-xs text-slate-500">Pilih folder lebih dulu. PDF yang berhasil diunggah langsung tampil di halaman publik. Maksimum 25 MB.</p>
          <form onSubmit={upload} className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold">Folder<select value={folderId} onChange={event => setFolderId(event.target.value)} required className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"><option value="">Pilih folder</option>{data.folders.map(folder => <option key={folder.id} value={folder.id}>{folder.name}</option>)}</select></label>
            <label className="text-xs font-semibold">Judul informasi<input value={title} onChange={event => setTitle(event.target.value)} maxLength={160} placeholder="Kosongkan untuk memakai nama berkas" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label>
            <label className="text-xs font-semibold sm:col-span-2">Berkas PDF<input id="information-pdf-file" type="file" accept=".pdf,application/pdf" onChange={event => setFile(event.target.files?.[0] || null)} required className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm" /></label>
            <button disabled={busy || !folderId || !file} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#030C4D] px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:col-span-2 sm:justify-self-start"><UploadCloud size={17} />{busy ? 'Memproses…' : 'Unggah dan terbitkan'}</button>
          </form>
        </section>
        <section className="rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="font-bold">{selected ? `PDF dalam ${selected.name}` : 'Pilih folder'}</h2>
          <div className="mt-4 space-y-3">{documents.length ? documents.map(doc => <div key={doc.id} className="rounded-xl border border-slate-200 p-4">
            {editingDocument === doc.id ? <form onSubmit={saveDocument} className="flex gap-2"><input value={editName} onChange={event => setEditName(event.target.value)} maxLength={160} required autoFocus className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-sm" /><button disabled={busy} className="text-sm font-bold text-[#030C4D]">Simpan</button><button type="button" onClick={() => setEditingDocument('')} className="text-sm text-slate-500">Batal</button></form> : <div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3"><FileText className="mt-0.5 shrink-0 text-[#030C4D]" size={20} /><div><p className="font-semibold">{doc.title}</p><p className="mt-1 text-xs text-slate-500">{doc.file_name} · {(doc.size_bytes / 1024 / 1024).toFixed(1)} MB · {doc.published ? 'Terbit' : 'Disembunyikan'}</p></div></div>
              <ActionGroup className="flex-wrap">
                <ActionButton action="copy" tooltip="Salin tautan halaman" disabled={!doc.published} onClick={() => void copy(informationLink(doc.id))} />
                <ActionButton action="copy" tooltip="Salin tautan PDF langsung" disabled={!doc.published} onClick={() => void copy(informationFileLink(doc.id))} />
                {doc.published && <ActionButton action="view" tooltip="Buka halaman publik" onClick={() => window.open(informationLink(doc.id), '_blank', 'noopener,noreferrer')} />}
                <ActionButton action="edit" tooltip="Ubah judul" onClick={() => { setEditingDocument(doc.id); setEditName(doc.title); }} />
                <ActionButton action="toggle" tooltip={doc.published ? 'Sembunyikan PDF' : 'Terbitkan PDF'} disabled={busy} onClick={() => void run(updateInformationDocument(doc.id, { published: !doc.published }), doc.published ? 'PDF disembunyikan.' : 'PDF diterbitkan.')} />
                <ActionButton action="delete" tooltip="Hapus PDF" disabled={busy} onClick={() => void removeDocument(doc)} />
              </ActionGroup></div>}
          </div>) : <p className="rounded-lg border border-dashed border-slate-200 p-5 text-sm text-slate-500">Belum ada PDF dalam folder ini.</p>}</div>
        </section>
      </div>
    </div>}
  </main>;
}
