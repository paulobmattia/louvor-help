// ===== APP STATE =====
const state = {
    minister: null,
    setlist: [],
    songs: []
};

// ===== DOM ELEMENTS =====
const elements = {
    ministerCards: document.querySelectorAll('.minister-card'),
    searchSection: document.getElementById('searchSection'),
    searchInput: document.getElementById('searchInput'),
    searchResults: document.getElementById('searchResults'),
    setlistContainer: document.getElementById('setlistContainer'),
    songCount: document.getElementById('songCount'),
    actionsSection: document.getElementById('actionsSection'),
    btnClear: document.getElementById('btnClear'),
    btnGeneratePDF: document.getElementById('btnGeneratePDF'),
    btnSharePDF: document.getElementById('btnSharePDF')
};

// ===== INITIALIZE =====
function init() {
    state.songs = window.SONGS_DATA || [];
    setupEventListeners();
}

// ===== EVENT LISTENERS =====
function setupEventListeners() {
    elements.ministerCards.forEach(card => {
        card.addEventListener('click', () => selectMinister(card.dataset.minister));
    });

    elements.searchInput.addEventListener('input', handleSearch);
    elements.searchInput.addEventListener('focus', handleSearch);
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            elements.searchResults.classList.remove('show');
        }
    });

    elements.btnClear.addEventListener('click', clearSetlist);
    elements.btnGeneratePDF.addEventListener('click', generatePDF);
    elements.btnSharePDF.addEventListener('click', sharePDF);
}

// ===== LOGIC =====
function selectMinister(minister) {
    state.minister = minister;
    elements.ministerCards.forEach(card => {
        card.classList.toggle('active', card.dataset.minister === minister);
    });
    elements.searchSection.classList.add('enabled');
    elements.searchInput.focus();
    renderSetlist();
}

function handleSearch() {
    const query = elements.searchInput.value.toLowerCase().trim();
    if (query.length < 2) {
        elements.searchResults.classList.remove('show');
        return;
    }
    const results = state.songs
        .filter(song => {
            const inSetlist = state.setlist.some(s => s.nome === song.nome);
            const matchesName = song.nome.toLowerCase().includes(query);
            const matchesArtist = song.banda.toLowerCase().includes(query);
            return !inSetlist && (matchesName || matchesArtist);
        })
        .slice(0, 8);
    renderSearchResults(results);
}

function renderSearchResults(results) {
    if (results.length === 0) {
        elements.searchResults.innerHTML = '<div class="search-result-item"><span class="result-name">Nenhuma música encontrada</span></div>';
        elements.searchResults.classList.add('show');
        return;
    }
    elements.searchResults.innerHTML = results.map(song => `
        <div class="search-result-item" data-song="${encodeURIComponent(JSON.stringify(song))}">
            <div class="result-name">${song.nome}</div>
            <div class="result-artist">${song.banda}</div>
        </div>
    `).join('');

    elements.searchResults.querySelectorAll('.search-result-item').forEach(item => {
        item.addEventListener('click', () => {
            const songData = JSON.parse(decodeURIComponent(item.dataset.song));
            addToSetlist(songData);
        });
    });
    elements.searchResults.classList.add('show');
}

function addToSetlist(song) {
    const newSong = { ...song };
    state.setlist.push(newSong);

    elements.searchInput.value = '';
    elements.searchResults.classList.remove('show');

    // Trigger Prefetch Immediately
    const index = state.setlist.length - 1;
    prefetchSmartKey(newSong, index);

    renderSetlist();
}

async function prefetchSmartKey(song, index) {
    if (song.smartKeyIndex !== undefined && song.originalKey) return;
    const key = getKey(song);

    try {
        console.log(`Prefetching key for ${song.nome}...`);
        // Always fetch with onlyKey to get the original tone from CifraClub
        const res = await fetch(`/api/cifra?url=${encodeURIComponent(song.cifraUrl)}&targetTone=${encodeURIComponent(key)}&onlyKey=true`);
        const data = await res.json();

        if (data.success) {
            if (data.finalKeyIndex !== undefined) {
                song.smartKeyIndex = data.finalKeyIndex;
            }
            // Store the original key from CifraClub for fallback display
            if (data.originalTone) {
                song.originalKey = data.originalTone;
                console.log(`Original key for ${song.nome}: ${data.originalTone}`);
            }
            renderSetlist();
        }
    } catch (e) {
        console.log("Prefetch silent fail", e);
    }
}

function removeFromSetlist(index) {
    state.setlist.splice(index, 1);
    renderSetlist();
}

function clearSetlist() {
    state.setlist = [];
    renderSetlist();
}

function getKey(song) {
    if (song.manualKey) return song.manualKey;

    let key = '';
    if (state.minister === 'masculino') key = song.tomMasculino;
    else if (state.minister === 'feminino') key = song.tomFeminino;
    else if (state.minister === 'kaianne') key = song.tomKaianne;

    // Se não houver tom definido para esse ministro, usar o tom original da cifra
    if (!key) {
        return song.originalKey || '-';
    }

    return key;
}

function transposeSong(index, direction) {
    const song = state.setlist[index];
    let currentKey = getKey(song);
    if (!currentKey || currentKey === '-') return;

    const allKeys = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    // Normalize flat notes to sharp equivalents for lookup
    const flatToSharp = { 'Db': 'C#', 'Eb': 'D#', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'Cb': 'B', 'Fb': 'E' };
    let isMinor = currentKey.toLowerCase().endsWith('m');
    let baseNote = currentKey.replace(/m$/i, '');
    if (flatToSharp[baseNote]) baseNote = flatToSharp[baseNote];
    baseNote = baseNote.toUpperCase();

    let keyIdx = allKeys.indexOf(baseNote);
    if (keyIdx === -1) return;

    keyIdx = (keyIdx + direction + 12) % 12;
    song.manualKey = allKeys[keyIdx] + (isMinor ? 'm' : '');

    renderSetlist();
}

function cleanKey(key) {
    if (!key) return null;
    return key.replace(/m$/, '').trim();
}

function getKeyIndex(keyName) {
    if (!keyName || keyName === '-') return null;
    let note = cleanKey(keyName).toUpperCase();
    const map = {
        'A': 0, 'AM': 0, 'A#': 1, 'BB': 1, 'BBM': 1, 'B': 2, 'BM': 2, 'C': 3, 'CM': 3,
        'C#': 4, 'DB': 4, 'DBM': 4, 'D': 5, 'DM': 5, 'D#': 6, 'EB': 6, 'EBM': 6,
        'E': 7, 'EM': 7, 'F': 8, 'FM': 8, 'F#': 9, 'GB': 9, 'GBM': 9, 'G': 10, 'GM': 10, 'G#': 11, 'AB': 11, 'ABM': 11
    };
    return map[note] !== undefined ? map[note] : null;
}

function getCifraUrlWithKey(url, keyName) {
    if (!url || !url.includes('cifraclub.com.br')) return url;
    try {
        const urlObj = new URL(url);
        urlObj.searchParams.set('capo', '0');
        const keyIndex = getKeyIndex(keyName);
        if (keyIndex !== null) urlObj.hash = `#key=${keyIndex}`;
        return urlObj.toString();
    } catch (e) { return url; }
}

window.openSmartCifra = async function (btn, index) {
    const song = state.setlist[index];
    const key = getKey(song);

    // UI Loading
    const originalHtml = btn.innerHTML;
    btn.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Abrindo...';
    btn.style.cursor = 'wait';

    try {
        // FIXED: Relative URL
        const res = await fetch(`/api/cifra?url=${encodeURIComponent(song.cifraUrl)}&targetTone=${encodeURIComponent(key)}&onlyKey=true`);
        const data = await res.json();

        let targetUrl = '';
        if (data.success && data.finalKeyIndex !== undefined) {
            song.smartKeyIndex = data.finalKeyIndex;
            const baseUrl = song.cifraUrl.split('#')[0].split('?')[0];
            targetUrl = `${baseUrl}?capo=0#key=${data.finalKeyIndex}`;
        } else {
            targetUrl = getCifraUrlWithKey(song.cifraUrl, key);
        }

        window.open(targetUrl, '_blank');
        renderSetlist();

    } catch (e) {
        const targetUrl = getCifraUrlWithKey(song.cifraUrl, key);
        window.open(targetUrl, '_blank');
        alert('Erro de conexão. Abrindo link padrão.');
        renderSetlist();
    }
};

function renderSetlist() {
    const count = state.setlist.length;
    elements.songCount.textContent = `(${count})`;

    // Fix Visibility Logic
    if (count > 0) {
        elements.actionsSection.classList.remove('hidden');
        setTimeout(() => elements.actionsSection.classList.add('show'), 10);
    } else {
        elements.actionsSection.classList.remove('show');
        elements.actionsSection.classList.add('hidden');
    }

    if (count === 0) {
        elements.setlistContainer.innerHTML = `
            <div class="empty-state">
                <i class="ph ph-playlist"></i>
                <span>Selecione um ministro e adicione músicas</span>
            </div>`;
        return;
    }

    elements.setlistContainer.innerHTML = state.setlist.map((song, index) => {
        const key = getKey(song);
        const displayKey = (key && key !== '-') ? key : '...';

        // Smart Icon Logic
        if (song.cifraUrl) {
            cifraLink = `<span class="ready" title="Cifra disponível para PDF"><i class="ph ph-check-circle"></i> Disponível</span>`;
        }

        const videoLink = song.videoUrl ? `<a href="${song.videoUrl}" target="_blank"><i class="ph ph-video"></i> Vídeo</a>` : '';

        return `
            <div class="setlist-item" draggable="true" data-index="${index}">
                <div class="item-order">${index + 1}</div>
                <div class="item-info">
                    <div class="item-name">${song.nome}</div>
                    <div class="item-details">
                        <div class="item-key-group">
                            <button class="btn-transpose" onclick="transposeSong(${index}, -1)" title="Abaixar Tom"><i class="ph ph-minus"></i></button>
                            <span class="item-key">${displayKey}</span>
                            <button class="btn-transpose" onclick="transposeSong(${index}, 1)" title="Subir Tom"><i class="ph ph-plus"></i></button>
                        </div>
                        <span>${song.banda}</span>
                    </div>
                    <div class="item-links">${cifraLink} ${videoLink}</div>
                </div>
                <button class="item-remove" onclick="removeFromSetlist(${index})" title="Remover"><i class="ph ph-x"></i></button>
            </div>
        `;
    }).join('');

    setupDragAndDrop();
}

function setupDragAndDrop() {
    const items = elements.setlistContainer.querySelectorAll('.setlist-item');
    items.forEach(item => {
        // Desktop drag
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
        // Mobile touch
        item.addEventListener('touchstart', handleTouchStart, { passive: false });
    });
}

let draggedIndex = null;
let pendingDropIndex = null;

// Desktop handlers
function handleDragStart(e) { 
    draggedIndex = parseInt(e.target.dataset.index); 
    e.target.classList.add('dragging'); 
}

function handleDragEnd(e) { 
    e.target.classList.remove('dragging'); 
    if (draggedIndex !== null && pendingDropIndex !== null && draggedIndex !== pendingDropIndex) {
        const [moved] = state.setlist.splice(draggedIndex, 1);
        state.setlist.splice(pendingDropIndex, 0, moved);
        renderSetlist();
    }
    draggedIndex = null;
    pendingDropIndex = null;
}

function handleDragOver(e) { e.preventDefault(); }

function handleDrop(e) {
    e.preventDefault();
    const dropTarget = e.target.closest('.setlist-item');
    if (!dropTarget) return;
    pendingDropIndex = parseInt(dropTarget.dataset.index);
}

// Mobile touch handlers
let touchStartY = 0;
let touchDragItem = null;
let touchClone = null;
let touchTimeout = null;
let touchActive = false;

function handleTouchStart(e) {
    const item = e.target.closest('.setlist-item');
    if (!item) return;
    // Ignore touches on buttons (transpose, remove)
    if (e.target.closest('button') || e.target.closest('a')) return;

    touchStartY = e.touches[0].clientY;
    touchDragItem = item;
    draggedIndex = parseInt(item.dataset.index);

    // Long press to initiate drag (300ms)
    touchTimeout = setTimeout(() => {
        touchActive = true;
        item.classList.add('dragging');

        // Create floating clone
        touchClone = item.cloneNode(true);
        touchClone.classList.add('touch-clone');
        const rect = item.getBoundingClientRect();
        touchClone.style.width = rect.width + 'px';
        touchClone.style.left = rect.left + 'px';
        touchClone.style.top = rect.top + 'px';
        document.body.appendChild(touchClone);

        document.addEventListener('touchmove', handleTouchMove, { passive: false });
        document.addEventListener('touchend', handleTouchEnd);
        document.addEventListener('touchcancel', handleTouchEnd);
    }, 300);

    // Cancel long press if finger moves too much
    const cancelCheck = (ev) => {
        if (Math.abs(ev.touches[0].clientY - touchStartY) > 10) {
            clearTimeout(touchTimeout);
            document.removeEventListener('touchmove', cancelCheck);
        }
    };
    document.addEventListener('touchmove', cancelCheck, { passive: true });
}

function handleTouchMove(e) {
    if (!touchActive || !touchClone) return;
    e.preventDefault();
    const y = e.touches[0].clientY;
    touchClone.style.top = y - 30 + 'px';

    // Highlight drop target
    const items = elements.setlistContainer.querySelectorAll('.setlist-item');
    items.forEach(it => it.classList.remove('drag-over'));
    const target = document.elementFromPoint(e.touches[0].clientX, y);
    const dropItem = target ? target.closest('.setlist-item') : null;
    if (dropItem && dropItem !== touchDragItem) {
        dropItem.classList.add('drag-over');
    }
}

function handleTouchEnd(e) {
    clearTimeout(touchTimeout);
    document.removeEventListener('touchmove', handleTouchMove);
    document.removeEventListener('touchend', handleTouchEnd);
    document.removeEventListener('touchcancel', handleTouchEnd);

    if (!touchActive) return;
    touchActive = false;

    // Clean up clone early to prevent ghost
    if (touchClone) {
        touchClone.remove();
        touchClone = null;
    }

    // Clean up styles immediately
    const items = elements.setlistContainer.querySelectorAll('.setlist-item');
    items.forEach(it => { it.classList.remove('dragging'); it.classList.remove('drag-over'); });

    // Find drop target
    const y = e.changedTouches ? e.changedTouches[0].clientY : touchStartY;
    const x = e.changedTouches ? e.changedTouches[0].clientX : 0;

    const target = document.elementFromPoint(x, y);
    const dropItem = target ? target.closest('.setlist-item') : null;
    if (dropItem) {
        const dropIndex = parseInt(dropItem.dataset.index);
        if (draggedIndex !== null && draggedIndex !== dropIndex) {
            const [moved] = state.setlist.splice(draggedIndex, 1);
            state.setlist.splice(dropIndex, 0, moved);
            renderSetlist();
        }
    }

    touchDragItem = null;
    draggedIndex = null;
}

async function buildPDF(statusCallback) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFont('courier', 'normal');

    const ministerLabel = { masculino: 'Homem', feminino: 'Mulher', kaianne: 'Kaianne' };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.text('Setlist - Louvor Help', 105, 20, { align: 'center' });
    doc.setFontSize(14);
    doc.text(`Ministro: ${ministerLabel[state.minister]}`, 105, 30, { align: 'center' });

    const today = new Date().toLocaleDateString('pt-BR');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Data: ${today}`, 105, 40, { align: 'center' });

    doc.setLineWidth(0.5);
    doc.line(20, 45, 190, 45);
    let y = 55;

    doc.setFontSize(11);
    state.setlist.forEach((song, index) => {
        const key = getKey(song);
        const displayKey = (key && key !== '-') ? key : (song.originalKey || 'Original');
        doc.text(`${index + 1}. ${song.nome} (${displayKey})`, 20, y);
        y += 7;
    });

    for (let i = 0; i < state.setlist.length; i++) {
        const song = state.setlist[i];
        const key = getKey(song);
        const index = i + 1;

        if (statusCallback) statusCallback(index, state.setlist.length);

        doc.addPage();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text(`${index}. ${song.nome}`, 20, 20);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        const displayKey = (key && key !== '-') ? key : (song.originalKey || 'Original');
        doc.text(`Tom: ${displayKey} | Banda: ${song.banda}`, 20, 28);

        try {
            const response = await fetch(`/api/cifra?url=${encodeURIComponent(song.cifraUrl)}&targetTone=${encodeURIComponent(key)}`);

            if (!response.ok) {
                let errMsg = 'Falha no servidor';
                try {
                    const errJson = await response.json();
                    if (errJson.error) errMsg = errJson.error;
                } catch (e) { }
                throw new Error(errMsg);
            }

            const data = await response.json();

            if (data.success && data.letra) {
                const tomUsado = data.tom || displayKey;

                doc.setFont('helvetica', 'italic');
                doc.setFontSize(10);
                doc.text(`(Cifra baixada no tom: ${tomUsado})`, 20, 35);

                doc.setTextColor(0);
                doc.setFont('courier', 'normal');
                doc.setFontSize(10);

                let plainText = data.letra
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<\/?[^>]+(>|$)/g, "");

                const txt = document.createElement('textarea');
                txt.innerHTML = plainText;
                plainText = txt.value;

                const splitText = doc.splitTextToSize(plainText, 170);
                let cursorY = 45;
                for (let line of splitText) {
                    if (cursorY > 280) { doc.addPage(); cursorY = 20; }
                    doc.text(line, 20, cursorY);
                    cursorY += 5;
                }
            } else { throw new Error('Conteúdo vazio'); }

        } catch (error) {
            console.error('Erro:', error);
            doc.setFont('helvetica', 'italic');
            doc.setTextColor(150);
            doc.text(`Não foi possível carregar: ${error.message || 'Erro desconhecido'}`, 20, 50);
            doc.setTextColor(0);
        }

        // Small delay between requests to avoid CifraClub rate-limiting
        if (i < state.setlist.length - 1) {
            await new Promise(r => setTimeout(r, 1500));
        }
    }

    return doc;
}

async function generatePDF() {
    const btnText = elements.btnGeneratePDF.innerHTML;
    elements.btnGeneratePDF.disabled = true;
    elements.btnGeneratePDF.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Iniciando...';

    const doc = await buildPDF((current, total) => {
        elements.btnGeneratePDF.innerHTML = `<i class="ph ph-spinner ph-spin"></i> Baixando ${current}/${total}...`;
    });

    const today = new Date().toLocaleDateString('pt-BR');
    doc.save(`setlist-${today.replace(/\//g, '-')}-com-cifras.pdf`);
    elements.btnGeneratePDF.innerHTML = btnText;
    elements.btnGeneratePDF.disabled = false;
    renderSetlist();
}

async function sharePDF() {
    const btnText = elements.btnSharePDF.innerHTML;
    elements.btnSharePDF.disabled = true;
    elements.btnSharePDF.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Gerando...';

    try {
        // Build the PDF using the same logic
        const pdfDoc = await buildPDF((current, total) => {
            elements.btnSharePDF.innerHTML = `<i class="ph ph-spinner ph-spin"></i> Baixando ${current}/${total}...`;
        });
        const today = new Date().toLocaleDateString('pt-BR');
        const fileName = `setlist-${today.replace(/\//g, '-')}-com-cifras.pdf`;

        // Get PDF as blob
        const pdfBlob = pdfDoc.output('blob');
        const pdfFile = new File([pdfBlob], fileName, { type: 'application/pdf' });

        const shareMessage = 'Acesse o setlist dessa semana! Bom ensaio!';

        // Check if Web Share API with files is supported
        if (navigator.canShare && navigator.canShare({ files: [pdfFile] })) {
            await navigator.share({
                title: 'Setlist - Louvor Help',
                text: shareMessage,
                files: [pdfFile]
            });
        } else if (navigator.share) {
            // Share without file (text only)
            await navigator.share({
                title: 'Setlist - Louvor Help',
                text: shareMessage
            });
            // Also download the PDF since we couldn't share the file
            pdfDoc.save(fileName);
        } else {
            // Fallback: download + open WhatsApp with text
            pdfDoc.save(fileName);
            const waUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
            window.open(waUrl, '_blank');
        }
    } catch (error) {
        if (error.name !== 'AbortError') {
            console.error('Erro ao compartilhar:', error);
            alert('Erro ao compartilhar. O PDF será baixado normalmente.');
            // Fallback download
            try {
                const pdfDoc = await buildPDF();
                const today = new Date().toLocaleDateString('pt-BR');
                pdfDoc.save(`setlist-${today.replace(/\//g, '-')}-com-cifras.pdf`);
            } catch(e) { console.error(e); }
        }
    }

    elements.btnSharePDF.innerHTML = btnText;
    elements.btnSharePDF.disabled = false;
    renderSetlist();
}

window.removeFromSetlist = removeFromSetlist;
window.transposeSong = transposeSong;
document.addEventListener('DOMContentLoaded', init);
