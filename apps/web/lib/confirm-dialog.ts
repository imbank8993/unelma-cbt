import Swal, { SweetAlertIcon } from 'sweetalert2';
import './confirm-dialog.css';

export type DialogVariant = 'danger' | 'warning' | 'info' | 'primary' | 'success';

export interface ConfirmOptions {
  title: string;
  text?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: DialogVariant;
  icon?: SweetAlertIcon;
}

export interface AlertOptions {
  title: string;
  text?: string;
  confirmText?: string;
  variant?: DialogVariant;
  icon?: SweetAlertIcon;
}

/* Ikon garis (gaya Lucide) di dalam lingkaran berwarna lembut, satu per jenis dialog. */
const svg = (paths: string) =>
  `<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS: Record<DialogVariant, string> = {
  danger: svg('<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>'),
  warning: svg('<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>'),
  primary: svg('<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>'),
  success: svg('<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>'),
};
/** Pesan kesalahan (bukan konfirmasi hapus) memakai ikon silang. */
const ERROR_ICON = svg('<circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/>');

/** Ikon SweetAlert lama dipetakan ke jenis dialog agar pemanggil lama tetap konsisten. */
function variantFor(variant: DialogVariant | undefined, icon: SweetAlertIcon | undefined, fallback: DialogVariant): DialogVariant {
  if (variant) return variant;
  if (icon === 'error') return 'danger';
  if (icon === 'warning') return 'warning';
  if (icon === 'success') return 'success';
  if (icon === 'question') return 'primary';
  if (icon === 'info') return 'info';
  return fallback;
}

function dialogClasses(variant: DialogVariant) {
  return {
    container: 'acca-confirm-overlay',
    popup: `acca-confirm acca-confirm--${variant}`,
    icon: 'acca-confirm-icon',
    title: 'acca-confirm-title',
    htmlContainer: 'acca-confirm-body',
    confirmButton: 'acca-confirm-yes',
    cancelButton: 'acca-confirm-no',
    actions: 'acca-confirm-actions',
  };
}

export async function confirmDialog({
  title,
  text,
  confirmText = 'Ya, Lanjutkan',
  cancelText = 'Batal',
  variant,
  icon,
}: ConfirmOptions): Promise<boolean> {
  const kind = variantFor(variant, icon, 'primary');
  const result = await Swal.fire({
    title,
    text,
    icon: 'info',
    iconHtml: ICONS[kind],
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    reverseButtons: true,
    focusCancel: kind === 'danger',
    width: 420,
    padding: 0,
    buttonsStyling: false,
    showClass: { popup: 'acca-confirm-in' },
    hideClass: { popup: 'acca-confirm-out' },
    customClass: dialogClasses(kind),
  });

  return result.isConfirmed;
}

export async function deleteConfirmDialog(
  titleOrOptions: string | Omit<ConfirmOptions, 'variant'>,
  text?: string
): Promise<boolean> {
  if (typeof titleOrOptions === 'string') {
    return confirmDialog({ title: titleOrOptions, text, confirmText: 'Ya, Hapus', cancelText: 'Batal', variant: 'danger' });
  }
  return confirmDialog({ confirmText: 'Ya, Hapus', cancelText: 'Batal', ...titleOrOptions, variant: 'danger' });
}

export async function alertDialog({
  title,
  text,
  confirmText = 'Mengerti',
  variant,
  icon,
}: AlertOptions): Promise<void> {
  const kind = variantFor(variant, icon, 'info');
  await Swal.fire({
    title,
    text,
    icon: 'info',
    iconHtml: kind === 'danger' ? ERROR_ICON : ICONS[kind],
    confirmButtonText: confirmText,
    buttonsStyling: false,
    width: 420,
    padding: 0,
    showClass: { popup: 'acca-confirm-in' },
    hideClass: { popup: 'acca-confirm-out' },
    customClass: dialogClasses(kind),
  });
}

/**
 * Pengganti `alert()` bawaan browser: pesan singkat dengan dialog bertema.
 * Jenis dan judul ditebak dari isi pesan ("Gagal…", "Berhasil…").
 */
export function notify(message: unknown, variant?: DialogVariant): Promise<void> {
  const text = String(message ?? '');
  const kind: DialogVariant = variant
    ?? (/^(gagal|error|terjadi kesalahan)|tidak dapat|tidak bisa|tidak valid|belum dapat/i.test(text) ? 'danger'
      : /^(berhasil|sukses|selesai)|berhasil/i.test(text) ? 'success'
        : 'warning');
  const title = kind === 'danger' ? 'Gagal' : kind === 'success' ? 'Berhasil' : 'Perhatian';
  return alertDialog({ title, text, variant: kind });
}
