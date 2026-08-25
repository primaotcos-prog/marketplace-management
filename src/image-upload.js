import { supabase } from './supabase.js';

const BUCKET = 'gameboost-images';
const MAX_SIZE = 5 * 1024 * 1024;
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const ACCEPTED_EXT = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif']);

const esc = value => String(value ?? '').replace(/[&<>\"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', "'": '&#39;'
}[c]));

function extension(file) {
  const ext = String(file.name || '').split('.').pop()?.toLowerCase() || '';
  if (ACCEPTED_EXT.has(ext)) return ext === 'jpeg' ? 'jpg' : ext;
  if (file.type === 'image/jpeg') return 'jpg';
  if (file.type === 'image/png') return 'png';
  if (file.type === 'image/webp') return 'webp';
  if (file.type === 'image/gif') return 'gif';
  return '';
}

function getUrls(textarea) {
  return String(textarea.value || '').split(/\r?\n/).map(x => x.trim()).filter(Boolean);
}

function setUrls(textarea, urls) {
  textarea.value = [...new Set(urls)].join('\n');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

function createUi(textarea) {
  if (textarea.dataset.imageUploadReady === '1') return;
  textarea.dataset.imageUploadReady = '1';

  const label = textarea.closest('label');
  if (!label) return;

  const originalLabel = label.querySelector('span');
  if (originalLabel) originalLabel.innerHTML = 'Images <small>(upload langsung dari HP)</small>';

  textarea.classList.add('image-url-storage');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.tabIndex = -1;
  textarea.style.display = 'none';

  const wrapper = document.createElement('div');
  wrapper.className = 'image-upload-box';
  wrapper.innerHTML = `
    <div class="image-upload-main">
      <input class="image-file-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple hidden>
      <button class="action image-upload-button" type="button">📷 Upload gambar</button>
      <div class="image-upload-copy">
        <strong>Pilih gambar dari perangkat</strong>
        <small>JPG, PNG, WEBP, GIF · maksimal 5 MB per gambar</small>
      </div>
    </div>
    <div class="image-upload-status" aria-live="polite">Belum ada gambar.</div>
    <div class="image-preview-grid"></div>
  `;

  textarea.insertAdjacentElement('afterend', wrapper);

  const input = wrapper.querySelector('.image-file-input');
  const button = wrapper.querySelector('.image-upload-button');
  const status = wrapper.querySelector('.image-upload-status');
  const previews = wrapper.querySelector('.image-preview-grid');

  button.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    const files = Array.from(input.files || []);
    input.value = '';
    if (!files.length) return;

    const invalid = files.find(file => !ACCEPTED.has(file.type) || file.size > MAX_SIZE || !extension(file));
    if (invalid) {
      status.textContent = `❌ ${invalid.name}: format tidak didukung atau ukuran lebih dari 5 MB.`;
      return;
    }

    button.disabled = true;
    status.textContent = `⏳ Mengupload ${files.length} gambar...`;

    const urls = getUrls(textarea);
    let uploaded = 0;

    try {
      for (const file of files) {
        const ext = extension(file);
        const random = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const path = `listings/${random}.${ext}`;

        const { data, error } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, {
            cacheControl: '31536000',
            contentType: file.type,
            upsert: false
          });

        if (error) throw new Error(`${file.name}: ${error.message}`);

        const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(data.path);
        if (!publicData?.publicUrl) throw new Error(`${file.name}: URL publik tidak tersedia.`);

        urls.push(publicData.publicUrl);
        uploaded += 1;
        setUrls(textarea, urls);
        renderPreviews(textarea, wrapper);
        status.textContent = `✅ ${uploaded}/${files.length} gambar berhasil diupload.`;
      }
    } catch (error) {
      status.textContent = `❌ Upload gagal: ${error?.message || 'Kesalahan tidak diketahui.'}`;
    } finally {
      button.disabled = false;
    }
  });

  renderPreviews(textarea, wrapper);
}

async function removeImage(textarea, wrapper, url) {
  const prefix = `https://tqsaukjmlwjucnmtstab.supabase.co/storage/v1/object/public/${BUCKET}/`;
  if (!url.startsWith(prefix)) return;
  const path = decodeURIComponent(url.slice(prefix.length));
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    wrapper.querySelector('.image-upload-status').textContent = `❌ Gagal menghapus gambar: ${error.message}`;
    return;
  }
  setUrls(textarea, getUrls(textarea).filter(x => x !== url));
  renderPreviews(textarea, wrapper);
}

function renderPreviews(textarea, wrapper) {
  const previews = wrapper.querySelector('.image-preview-grid');
  const status = wrapper.querySelector('.image-upload-status');
  const urls = getUrls(textarea);
  previews.innerHTML = urls.map((url, index) => `
    <div class="image-preview-item">
      <img src="${esc(url)}" alt="Preview ${index + 1}" loading="lazy">
      <button type="button" class="image-remove-button" data-image-remove="${esc(url)}" title="Hapus gambar">×</button>
    </div>
  `).join('');

  if (!urls.length) status.textContent = 'Belum ada gambar. Upload minimal 1 gambar.';
  else status.textContent = `${urls.length} gambar siap digunakan oleh GameBoost.`;

  previews.querySelectorAll('[data-image-remove]').forEach(button => {
    button.addEventListener('click', () => removeImage(textarea, wrapper, button.dataset.imageRemove));
  });
}

function scan(root = document) {
  root.querySelectorAll?.('textarea[name="image_urls"]').forEach(createUi);
}

scan();
const observer = new MutationObserver(() => scan());
observer.observe(document.body, { childList: true, subtree: true });
