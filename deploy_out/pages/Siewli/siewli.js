// Build gallery from the inline JSON manifest and wire up a lightbox.
// Thumbnails 3:2 -> full-resolution any aspect. Animated open/close.

(function () {
  const manifestEl = document.getElementById('photo-manifest');
  const galleryEl  = document.getElementById('gallery');
  if (!manifestEl || !galleryEl) return;

  let items = [];
  try {
    const { photos } = JSON.parse(manifestEl.textContent.trim());
    items = Array.isArray(photos) ? photos : [];
  } catch (e) { console.warn('Invalid gallery manifest', e); }

  // Helper: compute URLs from naming rule
  const urlFor = (name, kind) => {
    if (kind === 'thumb') return `./images/thumbs/thumbnail_${name}.jpg`;
    // Try .png by default; fallback to .jpg if PNG 404s later (lazy swap).
    return `./images/full/${name}.png`;
  };

  // Build DOM
  const fragment = document.createDocumentFragment();
  items.forEach((it, idx) => {
    const card = document.createElement('a');
    card.href = urlFor(it.name, 'full');
    card.className = 'gallery-item';
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', it.alt || `Photo ${idx + 1}`);

    const img = document.createElement('img');
    img.loading = 'lazy';
    img.decoding = 'async';
    img.alt = it.alt || '';
    img.src = urlFor(it.name, 'thumb');

    card.appendChild(img);
    fragment.appendChild(card);
  });
  galleryEl.appendChild(fragment);

  // Lightbox
  const lb = document.getElementById('lightbox');
  const lbImg = document.getElementById('lightbox-img');
  const lbCap = document.getElementById('lightbox-caption');
  const closeBtn = lb.querySelector('.lightbox-close');
  const prevBtn = lb.querySelector('.lightbox-nav.prev');
  const nextBtn = lb.querySelector('.lightbox-nav.next');

  let currentIndex = -1;

  function openAt(i) {
    currentIndex = i;
    const it = items[i];
    if (!it) return;

    lbImg.src = urlFor(it.name, 'full');
    lbImg.alt = it.alt || '';
    lbCap.textContent = it.caption || '';
    lb.hidden = false;

    // If PNG fails, swap to JPG automatically
    lbImg.onerror = () => {
      const jpg = `./images/full/${it.name}.jpg`;
      if (lbImg.src.endsWith('.png')) lbImg.src = jpg;
    };

    document.body.style.overflow = 'hidden';
  }
  function close() {
    lb.hidden = true;
    lbImg.src = '';
    document.body.style.overflow = '';
  }
  function next(dir = 1) {
    if (!items.length) return;
    const i = (currentIndex + dir + items.length) % items.length;
    openAt(i);
  }

  galleryEl.addEventListener('click', (e) => {
    const a = e.target.closest('a.gallery-item');
    if (!a) return;
    e.preventDefault();
    const nodes = [...galleryEl.querySelectorAll('a.gallery-item')];
    const i = nodes.indexOf(a);
    openAt(i);
  });

  closeBtn.addEventListener('click', close);
  lb.addEventListener('click', (e) => { if (e.target === lb) close(); });
  prevBtn.addEventListener('click', () => next(-1));
  nextBtn.addEventListener('click', () => next(1));

  // Keyboard
  window.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowRight') next(1);
    if (e.key === 'ArrowLeft') next(-1);
  });
})();
