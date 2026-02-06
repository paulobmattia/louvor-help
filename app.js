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
    btnGeneratePDF: document.getElementById('btnGeneratePDF')
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
    if (song.smartKeyIndex !== undefined) return;
    const key = getKey(song);

    try {
        console.log(`Prefetching key for ${song.nome}...`);
        // FIXED: Relative URL
        const res = await fetch(`/api/cifra?url=${encodeURIComponent(song.cifraUrl)}&targetTone=${encodeURIComponent(key)}&onlyKey=true`);
        const data = await res.json();

        if (data.success && data.finalKeyIndex !== undefined) {
            song.smartKeyIndex = data.finalKeyIndex;
            console.log(`Resolved key for ${song.nome}: ${data.finalKeyIndex}`);
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
    if (state.minister === 'masculino') return song.tomMasculino || '-';
    if (state.minister === 'feminino') return song.tomFeminino || '-';
    if (state.minister === 'kaianne') return song.tomKaianne || song.tomFeminino || '-';
    return '-';
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
                        <span class="item-key">${key}</span>
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
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
        item.addEventListener('dragover', handleDragOver);
        item.addEventListener('drop', handleDrop);
    });
}

let draggedIndex = null;
function handleDragStart(e) { draggedIndex = parseInt(e.target.dataset.index); e.target.classList.add('dragging'); }
function handleDragEnd(e) { e.target.classList.remove('dragging'); }
function handleDragOver(e) { e.preventDefault(); }
function handleDrop(e) {
    e.preventDefault();
    const dropIndex = parseInt(e.target.closest('.setlist-item').dataset.index);
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
        const [moved] = state.setlist.splice(draggedIndex, 1);
        state.setlist.splice(dropIndex, 0, moved);
        renderSetlist();
    }
}

async function generatePDF() {
    const btnText = elements.btnGeneratePDF.innerHTML;
    elements.btnGeneratePDF.disabled = true;
    elements.btnGeneratePDF.innerHTML = '<i class="ph ph-spinner ph-spin"></i> Iniciando...';

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
        doc.text(`${index + 1}. ${song.nome} (${key})`, 20, y);
        y += 7;
    });

    for (let i = 0; i < state.setlist.length; i++) {
        const song = state.setlist[i];
        const key = getKey(song);
        const index = i + 1;

        elements.btnGeneratePDF.innerHTML = `<i class="ph ph-spinner ph-spin"></i> Baixando ${index}/${state.setlist.length}...`;

        doc.addPage();
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.text(`${index}. ${song.nome}`, 20, 20);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.text(`Tom: ${key} | Banda: ${song.banda}`, 20, 28);

        try {
            // FETCH PDF CONTENT
            const response = await fetch(`/api/cifra?url=${encodeURIComponent(song.cifraUrl)}&targetTone=${encodeURIComponent(key)}`);
            if (!response.ok) throw new Error('Falha no servidor');

            const data = await response.json();

            if (data.success && data.letra) {
                const tomUsado = data.tom || key;

                doc.setFont('helvetica', 'italic');
                doc.setFontSize(10);
                doc.text(`(Cifra baixada no tom: ${tomUsado})`, 20, 35);

                // Remove Link Logic, just title and content
                doc.setTextColor(0);

                doc.setFont('courier', 'normal');
                doc.setFontSize(10);

                // Convert HTML string to Plain Text for PDF
                // Create a temporary element to strip HTML (preserving line breaks)
                // Note: The backend checks chords in <b> tags. We want to keep them just as text.
                // Simple regex replacer for this environment:
                // Replace <br> with newline, then strip other tags.
                let plainText = data.letra
                    .replace(/<br\s*\/?>/gi, '\n')
                    .replace(/<\/?[^>]+(>|$)/g, ""); // Strip all tags (<b>, <pre>, etc)

                // Decode entities usually handled by browser (e.g. &nbsp;)
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
    }

    doc.save(`setlist-${today.replace(/\//g, '-')}-com-cifras.pdf`);
    elements.btnGeneratePDF.innerHTML = btnText;
    elements.btnGeneratePDF.disabled = false;
    renderSetlist();
}

window.removeFromSetlist = removeFromSetlist;
document.addEventListener('DOMContentLoaded', init);
