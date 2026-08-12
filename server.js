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

    // Build root preserving lowercase 'b' for flat lookup
    let root = match[1].toUpperCase() + (match[2] || '');
    if (match[2] === 'b') {
        // Convert flats to sharps for standard index calculation
        const flatMap = { 'Cb': 'B', 'Db': 'C#', 'Eb': 'D#', 'Fb': 'E', 'Gb': 'F#', 'Ab': 'G#', 'Bb': 'A#' };
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
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const { url, targetTone } = req.query;
    if (!url) return res.status(400).json({ error: 'URL required' });

    log(`Processing: ${url} -> Target: ${targetTone}`);

    try {
        // 1. Fetch HTML with retry logic (CifraClub rate-limits rapid requests)
        let response;
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                response = await axios.get(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
                        'Cache-Control': 'no-cache'
                    },
                    timeout: 15000
                });
                break; // Success
            } catch (fetchErr) {
                log(`Attempt ${attempt}/${maxRetries} failed for ${url}: ${fetchErr.message}`);
                if (attempt === maxRetries) throw fetchErr;
                // Wait before retrying (1s, 2s, 3s)
                await new Promise(r => setTimeout(r, attempt * 1000));
            }
        }

        const $ = cheerio.load(response.data);

        // 2. Extract Song Metadata
        const songName = $('h1.t1').first().text().trim();
        const artistName = $('h2.t3 a').first().text().trim();

        // 3. Extract Original Tone
        let originalToneText = '';

        // Strategy 1: #key span or #key (CifraClub new layout)
        if ($('#key span').length > 0) {
            originalToneText = $('#key span').first().text().trim();
        } else if ($('#key').length > 0) {
            const m = $('#key').text().trim().match(/Tom:\s*([A-G][#b]?m?)/i) || $('#key').text().trim().match(/Tom\s*([A-G][#b]?m?)/i);
            if (m) originalToneText = m[1];
        }

        // Strategy 2: Legacy selectors
        if (!originalToneText) {
            originalToneText = $('#cifra_tom a').text().trim() ||
                $('#js-cifra-tom').text().trim() ||
                $('.cifra-tom').text().trim();
        }

        // Strategy 3: Regex search in page text for "Tom: X"
        if (!originalToneText) {
            const pageText = $('body').text();
            const tomMatch = pageText.match(/Tom:\s*([A-G][#b]?m?)/i);
            if (tomMatch) {
                originalToneText = tomMatch[1];
            }
        }

        // Clean up tone string (e.g. "Tom: Db")
        let formattedOriginalTone = originalToneText.replace(/^Tom:\s*/i, '').trim();

        // Strategy 4: Fallback to root of first chord in <pre> if still empty
        if (!formattedOriginalTone) {
            const firstChord = $('pre b').first().text().trim();
            if (firstChord) {
                const chordMatch = firstChord.match(/^([A-Ga-g][#b]?)/);
                if (chordMatch) {
                    formattedOriginalTone = chordMatch[1].toUpperCase();
                }
            }
        }

        if (!formattedOriginalTone) formattedOriginalTone = 'C';

        log(`Original Tone found: ${formattedOriginalTone}`);

        // Handle Capotraste (Chord Shape)
        let baseChordTone = formattedOriginalTone;
        const fullTomText = $('#cifra_tom').text().trim() || $('#js-cifra-tom').text().trim() || $('#capo').text().trim() || $('body').text();
        const shapeMatch = fullTomText.match(/forma dos acordes no tom de ([A-G][#b]?m?)/i) || fullTomText.match(/acordes no tom de ([A-G][#b]?m?)/i);
        if (shapeMatch) {
            baseChordTone = shapeMatch[1];
            log(`Capo detected. Original: ${formattedOriginalTone}, Shape Tone: ${baseChordTone}`);
        }

        // 4. Extract Cifra Content
        // Remove tablatures before extracting HTML
        $('.tab').remove();
        // CifraClub stores the cifra in a <pre> tag.
        // Chords are usually in <b> tags inside the <pre>.
        let preContent = $('pre').html();

        if (!preContent) {
            return res.status(404).json({ success: false, error: 'Cifra não encontrada no site (link pode estar quebrado).' });
        }

        // 5. Transpose ?
        let desiredTone = (targetTone && targetTone !== '-') ? targetTone : formattedOriginalTone;
        let finalTone = desiredTone;

        if (desiredTone !== baseChordTone) {

            let targetForCalc = desiredTone;
            const originalIsMinor = formattedOriginalTone.endsWith('m');
            const targetIsMinor = desiredTone.endsWith('m');

            // MUSIC THEORY FIX: Adjust for Relative Minor
            if (originalIsMinor && !targetIsMinor) {
                const tIndex = getSemitoneIndex(desiredTone);
                if (tIndex !== -1) {
                    let relIndex = (tIndex - 3);
                    if (relIndex < 0) relIndex += 12;
                    targetForCalc = NOTAS[relIndex] + 'm';
                    log(`Theory Fix: Original(${formattedOriginalTone}) is Minor, Target(${desiredTone}) is Major. Using Rel Minor(${targetForCalc}).`);
                }
            }

            log(`Transposing shapes from ${baseChordTone} to ${targetForCalc} (via Original ${formattedOriginalTone})`);

            // Use the base chord shape (which incorporates the capo offset) as the starting point
            const idxOriginal = getSemitoneIndex(baseChordTone);
            const idxTarget = getSemitoneIndex(targetForCalc);

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
            originalTone: formattedOriginalTone,
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
