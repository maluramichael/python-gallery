// Gallery functionality
const modal = document.getElementById('mediaModal');
const modalContent = modal.querySelector('.modal-content');
const modalClose = modal.querySelector('.modal-close');
const modalPrev = modal.querySelector('.modal-prev');
const modalNext = modal.querySelector('.modal-next');
const currentIndexSpan = document.getElementById('currentIndex');
const totalItemsSpan = document.getElementById('totalItems');
const filterInput = document.getElementById('filterInput');
const sizeSelect = document.getElementById('sizeSelect');
const sortSelect = document.getElementById('sortSelect');
const perPageSelect = document.getElementById('perPage');
const slideshowToggle = document.getElementById('slideshowToggle');
const intervalSelect = document.getElementById('slideshowInterval');

// Get all media items from the server
let currentIndex = 0;

// Local storage keys
const GALLERY_KEY = 'gallery_settings';

function getCurrentSettings() {
    const params = getUrlParams();
    
    return {
        sort: params.sort,
        order: params.order,
        per_page: params.per_page,
        filter: params.filter,
        size: params.size || 'medium'
    };
}

// Save settings to local storage
function saveSettings() {
    const params = getCurrentSettings();

    localStorage.setItem(GALLERY_KEY, JSON.stringify(params));
}

// Load saved settings
function loadSavedSettings() {
    const fromLocalStorage = JSON.parse(localStorage.getItem(GALLERY_KEY) || '{}');
    const fromUrl = getUrlParams();
    const params = { ...fromLocalStorage, ...fromUrl };

    // Load sort settings
    const savedSortBy = params.sort;
    const savedSortOrder = params.order;
    const savedPerPage = params.per_page;
    const savedFilter = params.filter;
    const savedSize = params.size;
    
    if (savedSortBy) {
        sortSelect.value = savedSortBy;
        // Disable order toggle for random sort
        const sortButton = document.querySelector('.sort-controls button');
        if (savedSortBy === 'random') {
            sortButton.disabled = true;
            sortButton.style.opacity = '0.5';
        } else {
            sortButton.disabled = false;
            sortButton.style.opacity = '1';
        }
    }
    
    if (savedSortOrder) {
        const sortButton = document.querySelector('.sort-controls button');
        sortButton.dataset.order = savedSortOrder;
        sortButton.querySelector('span').textContent = savedSortOrder.charAt(0).toUpperCase() + savedSortOrder.slice(1);
    }
    
    if (savedPerPage) {
        perPageSelect.value = savedPerPage;
    }

    if (savedFilter) {
        filterInput.value = savedFilter;
    }

    if (savedSize) {
        sizeSelect.value = savedSize;
        updateGallerySize(savedSize);
    }
}

// Add event listener for filter input
filterInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        const params = getUrlParams();
        params.filter = e.target.value;
        params.page = 1; // Reset to first page when filtering
        window.location.href = updateUrl(params);
    }
});

// Load settings when page loads
document.addEventListener('DOMContentLoaded', () => {
    loadSavedSettings();
});

totalItemsSpan.textContent = totalItems;

function showMedia(index) {
    if (index < 0 || index >= totalItems) return;
    
    currentIndex = index;
    currentIndexSpan.textContent = currentIndex + 1;

    const item = mediaItems[index];
    const path = item.path;
    
    modalContent.innerHTML = '';
    
    if (item.is_video) {
        const video = document.createElement('video');
        video.src = `/view/${path}`;
        video.controls = true;
        video.autoplay = true;
        modalContent.appendChild(video);
    } else {
        const img = document.createElement('img');
        img.src = `/view/${path}`;
        modalContent.appendChild(img);
    }

    // Update URL to reflect current page
    const params = getUrlParams();
    const itemsPerPage = params.per_page;
    const targetPage = Math.floor(index / itemsPerPage) + 1;
    
    if (targetPage !== params.page) {
        const newUrl = new URL(window.location.href);
        newUrl.searchParams.set('page', targetPage);
        window.history.replaceState({}, '', newUrl.toString());
    }
}

function showModal(index) {
    currentIndex = index;
    showMedia(index);
    modal.style.display = 'block';
    document.body.style.overflow = 'hidden';
}

function hideModal() {
    if (slideshowInterval) {
        stopSlideshow();
    }
    modal.style.display = 'none';
    document.body.style.overflow = '';
    modalContent.innerHTML = '';
}

// Attach click handlers to gallery items
document.querySelectorAll('.gallery-item').forEach((item, idx) => {
    const link = item.querySelector('a[href^="/view/"]');
    if (link) {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const parentDataItem = item.closest('.gallery-item');
            const index = parseInt(parentDataItem.getAttribute('data-index'));

            if (index !== -1) {
                showModal(index);
            }
        });
    }
});

// Modal controls
modalClose.addEventListener('click', hideModal);
modalPrev.addEventListener('click', () => {
    if (currentIndex > 0) {
        showMedia(currentIndex - 1);
    }
});
modalNext.addEventListener('click', () => {
    if (currentIndex < totalItems - 1) {
        showMedia(currentIndex + 1);
    } else if (currentIndex === totalItems - 1) {
        // At the last item, go to next page if available
        const params = getUrlParams();
        if (params.page < totalPages) {
            window.location.href = updateUrl({ ...params, page: params.page + 1 });
        }
    }
});

modal.addEventListener('click', (e) => {
    if (e.target === modal) {
        hideModal();
    }
});

// Keyboard controls
document.addEventListener('keydown', (e) => {
    const video = modalContent.querySelector('video');
    
    if (modal.style.display === 'block') {
        // Modal is open - handle media navigation
        switch(e.key) {
            case 'Escape':
                hideModal();
                break;
            case 'n':
            case 'N':
                if (currentIndex < totalItems - 1) {
                    showMedia(currentIndex + 1);
                } else if (currentIndex === totalItems - 1) {
                    // At the last item, go to next page if available
                    const params = getUrlParams();
                    if (params.page < totalPages) {
                        window.location.href = updateUrl({ ...params, page: params.page + 1 });
                    }
                }
                break;
            case 'p':
            case 'P':
                if (currentIndex > 0) {
                    showMedia(currentIndex - 1);
                } else if (currentIndex === 0) {
                    // At the first item, go to previous page if available
                    const params = getUrlParams();
                    if (params.page > 1) {
                        window.location.href = updateUrl({ ...params, page: params.page - 1 });
                    }
                }
                break;
            case 'm':
            case 'M':
                if (video) {
                    e.preventDefault();
                    video.muted = !video.muted;
                }
                break;
            case ' ':
                if (video) {
                    e.preventDefault();
                    video.paused ? video.play() : video.pause();
                }
                break;
            case 'ArrowLeft':
                if (video) {
                    e.preventDefault();
                    video.currentTime = Math.max(0, video.currentTime - 5);
                }
                break;
            case 'ArrowRight':
                if (video) {
                    e.preventDefault();
                    video.currentTime = Math.min(video.duration, video.currentTime + 5);
                }
                break;
            default:
                if (video && /^[0-9]$/.test(e.key)) {
                    e.preventDefault();
                    const percentage = parseInt(e.key) * 10;
                    video.currentTime = (percentage / 100) * video.duration;
                }
                break;
        }
    } else {
        // Modal is closed - handle page navigation
        switch(e.key) {
            case 'n':
            case 'N':
                const params = getUrlParams();
                if (params.page < totalPages) {
                    window.location.href = updateUrl({ ...params, page: params.page + 1 });
                }
                break;
            case 'p':
            case 'P':
                const currentParams = getUrlParams();
                if (currentParams.page > 1) {
                    window.location.href = updateUrl({ ...currentParams, page: currentParams.page - 1 });
                }
                break;
        }
    }
});

function preloadAdjacent(index) {
    const preloadImage = (idx) => {
        if (idx >= 0 && idx < totalItems) {
            const path = mediaItems[idx].path;
            if (!path.match(/\.(mp4|mov|avi)$/i)) {
                const img = new Image();
                img.src = path;
            }
        }
    };

    preloadImage(index - 1);
    preloadImage(index + 1);
}

let slideshowInterval = null;

function startSlideshow() {
    if (slideshowInterval) return;
    
    slideshowToggle.textContent = 'Stop Slideshow';
    slideshowToggle.classList.add('active');
    
    function advance() {
        const video = modalContent.querySelector('video');
        if (video && !video.ended) return;
        
        const nextIndex = (currentIndex + 1) % totalItems;
        showMedia(nextIndex);
    }

    const interval = parseInt(intervalSelect.value) * 1000;
    slideshowInterval = setInterval(advance, interval);
}

function stopSlideshow() {
    if (!slideshowInterval) return;
    
    clearInterval(slideshowInterval);
    slideshowInterval = null;
    slideshowToggle.textContent = 'Start Slideshow';
    slideshowToggle.classList.remove('active');
}

function toggleSlideshow() {
    if (slideshowInterval) {
        stopSlideshow();
    } else {
        startSlideshow();
    }
}

slideshowToggle.addEventListener('click', toggleSlideshow);
intervalSelect.addEventListener('change', () => {
    if (slideshowInterval) {
        stopSlideshow();
        startSlideshow();
    }
});

document.addEventListener('keydown', (e) => {
    if (modal.style.display !== 'block') return;

    if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        toggleSlideshow();
        return;
    }
});

function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

function formatDate(timestamp) {
    return new Date(timestamp * 1000).toLocaleString();
}

function updateSort() {
    const params = getUrlParams();
    params.sort = document.getElementById('sortSelect').value;
    const sortButton = document.querySelector('.sort-controls button');
    
    // Disable order toggle for random sort
    if (params.sort === 'random') {
        sortButton.disabled = true;
        sortButton.style.opacity = '0.5';
    } else {
        sortButton.disabled = false;
        sortButton.style.opacity = '1';
        params.order = sortButton.dataset.order;
    }
    
    saveSettings();
    window.location.href = updateUrl(params);
}

function toggleOrder() {
    const btn = document.querySelector('.sort-controls button');
    const newOrder = btn.dataset.order === 'asc' ? 'desc' : 'asc';
    btn.dataset.order = newOrder;
    btn.querySelector('span').textContent = newOrder.charAt(0).toUpperCase() + newOrder.slice(1);
    saveSettings();
    updateSort();
}

function getUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        sort: params.get('sort') || 'name',
        order: params.get('order') || 'asc',
        page: parseInt(params.get('page')) || 1,
        per_page: params.get('per_page') || '50',
        size: params.get('size') || 'medium',
        filter: params.get('filter') || ''
    };
}

function updateUrl(params) {
    const url = new URL(window.location.href);
    Object.entries(params).forEach(([key, value]) => {
        url.searchParams.set(key, value);
    });
    return url.toString();
}

function changePage(newPage) {
    const params = getUrlParams();
    params.page = newPage;
    window.location.href = updateUrl(params);
}

function changePerPage() {
    const params = getUrlParams();
    params.per_page = perPageSelect.value;
    params.page = 1;
    saveSettings();
    window.location.href = updateUrl(params);
}

function updateGallerySize(size) {
    const gallery = document.querySelector('.gallery-grid');
    gallery.dataset.size = size;
}

function updateSize() {
    const size = sizeSelect.value;
    const params = getUrlParams();
    params.size = size;
    saveSettings();
    window.location.href = updateUrl(params);
}

// Function to handle image loading and fade-in
function handleImageLoad(item) {
    const img = item.querySelector('img');
    if (img) {
        if (img.complete) {
            // Image already loaded
            item.classList.add('loaded');
        } else {
            // Image still loading
            img.addEventListener('load', () => {
                item.classList.add('loaded');
            });
        }
    } else {
        // No image (folder or other item)
        item.classList.add('loaded');
    }
}

// Initialize gallery items
document.addEventListener('DOMContentLoaded', () => {
    const galleryItems = document.querySelectorAll('.gallery-item');
    galleryItems.forEach(handleImageLoad);
});

// Update the existing updateGallery function to handle new items
function updateGallery(items) {
    const galleryGrid = document.querySelector('.gallery-grid');
    galleryGrid.innerHTML = '';
    
    items.forEach(item => {
        const galleryItem = createGalleryItem(item);
        galleryGrid.appendChild(galleryItem);
        handleImageLoad(galleryItem);
    });
} 