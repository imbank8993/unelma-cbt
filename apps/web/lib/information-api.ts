import { apiGet, apiSend, type ApiResult } from './api/client';

export interface InformationFolder {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface InformationDocument {
  id: string;
  folder_id: string;
  title: string;
  file_name: string;
  size_bytes: number;
  published: boolean;
  sort_order: number;
  created_at: string;
}

export interface InformationList {
  folders: InformationFolder[];
  documents: InformationDocument[];
}

export const informationLink = (id: string) => `/informasi/${encodeURIComponent(id)}`;
export const informationFolderLink = (id: string) => `/informasi?folder=${encodeURIComponent(id)}`;
export const informationFileLink = (id: string) => `/api/information/${encodeURIComponent(id)}/file`;

export const getPublicInformation = () => apiGet<InformationList>('/api/information');
export const getAdminInformation = () => apiGet<InformationList>('/api/information/admin');
export const createInformationFolder = (name: string) =>
  apiSend<{ folder: InformationFolder }>('/api/information/admin/folders', { name });
export const renameInformationFolder = (id: string, name: string) =>
  apiSend<{ folder: InformationFolder }>(`/api/information/admin/folders/${encodeURIComponent(id)}`, { name }, 'PATCH');
export const deleteInformationFolder = (id: string) =>
  apiSend<{ deleted: boolean }>(`/api/information/admin/folders/${encodeURIComponent(id)}`, {}, 'DELETE');
export const updateInformationDocument = (id: string, patch: { title?: string; folder_id?: string; published?: boolean }) =>
  apiSend<{ document: InformationDocument }>(`/api/information/admin/documents/${encodeURIComponent(id)}`, patch, 'PATCH');
export const deleteInformationDocument = (id: string) =>
  apiSend<{ deleted: boolean }>(`/api/information/admin/documents/${encodeURIComponent(id)}`, {}, 'DELETE');

export async function uploadInformationDocument(folderId: string, title: string, file: File): Promise<ApiResult<{ document: InformationDocument }>> {
  const form = new FormData();
  form.set('folder_id', folderId);
  form.set('title', title);
  form.set('file', file);
  try {
    const response = await fetch('/api/information/admin/documents', { method: 'POST', body: form });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) return { success: false, error: data.error || 'Unggah PDF gagal.' };
    return { success: true, document: data.document };
  } catch {
    return { success: false, error: 'Tidak dapat menghubungi server.' };
  }
}
