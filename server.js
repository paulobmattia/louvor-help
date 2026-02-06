const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();


app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

function log(msg) {
    const logParams = Array.from(arguments).join(' ');
    console.log(logParams);
    // Simple file log
    if (!process.env.PORT) {
        try {
            fs.appendFileSync(path.join(__dirname, 'server.log'), new Date().toISOString() + ' ' + logParams + '\n');
        } catch (e) {
            console.error("Log error", e);
        }
    }
}

// ===== TRANSPOSITION LOGIC =====
const NOTAS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const NOTAS_FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Map to normalize mixed notations (e.g. compability)
const NORMALIZE_MAP = {
    'Cb': 'B', 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#',
    'E#': 'F', 'B#': 'C'
};

function getSemitoneIndex(note) {
    // Clean note: remove 'm', '7', 'M', etc. Just get the root pitch.
    // Regex matches the note name (A-G) followed optionally by # or b
    const match = note.match(/^([A-Ga-g])(#|b)?/);
    if (!match) return -1;

    let root = match[0].toUpperCase();
    if (match[2] === 'b') {
        // Convert flats to sharps for standard index calculation
        const flatMap = { 'Cb': 'B', 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#', 'B': 'B', 'E': 'E' };
        if (flatMap[root]) root = flatMap[root];
    }

    return NOTAS.indexOf(root);
}

function transposeNote(note, semitones) {
    const match = note.match(/^([A-Ga-g])(#|b)?(.*)/); // 1: Root, 2: Accidental, 3: Suffix (m, 7, etc)
    if (!match) return note;

    let root = match[1].toUpperCase() + (match[2] || '');
    let suffix = match[3] || '';

    // Normalize to Sharp system for calculation
    if (NORMALIZE_MAP[root]) root = NORMALIZE_MAP[root];

    let currentIndex = NOTAS.indexOf(root);
    if (currentIndex === -1) {
        // Try flat system just in case
        currentIndex = NOTAS_FLAT.indexOf(root);
    }
    if (currentIndex === -1) return note; // Failed to identify

    // Calculate new index
    // semitones can be negative
    let newIndex = (currentIndex + semitones) % 12;
    if (newIndex < 0) newIndex += 12;

    // Determine output notation (Sharp or Flat)
    // Heuristic: If we are transposing UP significantly or target has flats, we might prefer flats?
    // For simplicity in MVP: Use Sharps by default unless original was clearly Flat-based? 
    // Let's stick to Sharps (CifraClub standard usually) or a robust logic.
    // Let's use the NOTAS array (Sharps).

    return NOTAS[newIndex] + suffix;
}

function transposeChord(chord, semitones) {
    // Format: "C/G" or "Am7"
    if (chord.includes('/')) {
        const parts = chord.split('/');
        return transposeNote(parts[0], semitones) + '/' + transposeNote(parts[1], semitones);
    }
    return transposeNote(chord, semitones);
}


// ===== API ROUTES =====

app.get('/api/search', async (req, res) => {
    const { q } = req.query;
    if (!q) return res.status(400).json({ error: 'Missing query' });

    try {
        log(`Searching for: ${q}`);
        // CifraClub's public search API or scraping search results
        // Using Google Custom Search style url manually or scraping the page: https://www.cifraclub.com.br/?q=...
        // For stability, let's try to fetch their internal suggestion API or scrape the HTML search page.
        // Current implementation in 'server.js' (old) wasn't shown fully, likely scraper.
        // Let's scrape:

        const searchUrl = `https://www.cifraclub.com.br/?q=${encodeURIComponent(q)}`;
        const response = await axios.get(searchUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const results = [];

        // Select results (adjust selectors based on CifraClub search page layout)
        $('.gs-result').each((i, el) => {
            const title = $(el).find('.gs-title').text().trim();
            const cleanUrl = $(el).find('a.gs-title').attr('href');
            const snippet = $(el).find('.gs-snippet').text().trim();

            if (cleanUrl && cleanUrl.includes('cifraclub.com.br')) {
                results.push({
                    title: title.replace(' - Cifra Club', ''),
                    url: cleanUrl,
                    snippet
                });
            }
        });

        // Fallback: If Google Custom Search HTML structure is hard to parse securely or blocked,
        // use their "suggestion" API if known. 
        // Or better: Let's assume the user pastes URL mostly, OR fixing search later. 
        // For now, let's emulate the OLD behavior. The user didn't complain about search, hope this works.
        // Actually, let's use the specific search endpoint if possible.
        // Let's try the suggestion API used by their header input:
        const suggestUrl = `https://studiosol.service-search.com.br/cifraclub/suggest?q=${encodeURIComponent(q)}&limit=5`;
        try {
            const sugRes = await axios.get(suggestUrl);
            if (sugRes.data && sugRes.data.docs) {
                const mapped = sugRes.data.docs.map(d => ({
                    title: `${d.u} - ${d.a}`, // music - artist
                    url: `https://www.cifraclub.com.br/${d.d}/${d.t}/`,
                    artist: d.a,
                    song: d.u
                }));
                return res.json({ success: true, results: mapped });
            }
        } catch (e) {
            log("Suggestion API failed, relying to basic scraping?");
        }

        res.json({ success: true, results: [] });

    } catch (e) {
        log(`Search failed: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/cifra', async (req, res) => {
    const { url, targetTone } = req.query;
    if (!url) return res.status(400).json({ error: 'URL required' });

    log(`Processing: ${url} -> Target: ${targetTone}`);

    try {
        // 1. Fetch HTML
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            },
            timeout: 10000 // 10s timeout
        });

        const $ = cheerio.load(response.data);

        // 2. Extract Song Metadata
        const songName = $('h1.t1').first().text().trim();
        const artistName = $('h2.t3 a').first().text().trim();

        // 3. Extract Original Tone
        let originalToneText = $('#js-cifra-tom').text().trim() ||
            $('a.js-modal-tom').text().trim() ||
            $('.cifra-tom').text().trim() || 'C'; // Default fallback

        // Clean up tone string (e.g. "Tom: Db")
        let formattedOriginalTone = originalToneText.replace(/^Tom:\s*/i, '').trim();

        log(`Original Tone found: ${formattedOriginalTone}`);

        // 4. Extract Cifra Content
        // CifraClub stores the cifra in a <pre> tag.
        // Chords are usually in <b> tags inside the <pre>.
        let preContent = $('pre').html();

        if (!preContent) {
            throw new Error('Cifra content <pre> not found.');
        }

        // 5. Transpose ?
        let finalTone = formattedOriginalTone;

        if (targetTone && targetTone !== '-' && targetTone !== formattedOriginalTone) {
            log(`Transposing from ${formattedOriginalTone} to ${targetTone}`);

            const idxOriginal = getSemitoneIndex(formattedOriginalTone);
            const idxTarget = getSemitoneIndex(targetTone);

            if (idxOriginal !== -1 && idxTarget !== -1) {
                const semitoneDiff = idxTarget - idxOriginal;
                log(`Semitone diff: ${semitoneDiff}`);

                // Load Cheerio specifically for the PRE content to manipulating <b> tags
                const $cifra = cheerio.load(preContent, null, false); // false = no page wrapper

                $cifra('b').each((i, el) => {
                    const chord = $cifra(el).text();
                    const newChord = transposeChord(chord, semitoneDiff);
                    $cifra(el).text(newChord);
                });

                preContent = $cifra.html();
                finalTone = targetTone;
            } else {
                log("Could not calculate index for original or target tone.");
            }
        }

        // Return Data
        res.json({
            success: true,
            songName,
            artist: artistName,
            tom: finalTone,
            letra: preContent // This now contains HTML with <b> tags for transposed chords
        });

    } catch (e) {
        log(`Error fetching/processing: ${e.message}`);
        res.status(500).json({ error: 'Server error: ' + e.message });
    }
});


// Start Server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    log(`🚀 Helper Server (Cheerio) running on ${PORT}`);
});
