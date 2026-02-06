const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, 'songs.csv');
const jsPath = path.join(__dirname, 'data.js');

try {
    const csvContent = fs.readFileSync(csvPath, 'utf8');
    const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');

    const songs = [];

    // Helper to handle CSV parsing with quotes
    function parseLine(text) {
        const result = [];
        let cell = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(cell.trim());
                cell = '';
            } else {
                cell += char;
            }
        }
        result.push(cell.trim());
        return result;
    }

    // Skip header and process lines
    for (let i = 1; i < lines.length; i++) {
        const cols = parseLine(lines[i]);

        if (cols.length < 2) continue; // Skip invalid lines

        // Mapping based on CSV structure:
        // 0: NOME, 1: BANDA, 2: TOM FEMININO, 3: TOM MASCULINO, 4: KAIANNE, 5: CIFRA, 6: LINK
        songs.push({
            nome: cols[0].replace(/^"|"$/g, '').trim(), // Remove quotes if present
            banda: cols[1].replace(/^"|"$/g, '').trim(),
            tomFeminino: cols[2].replace(/^"|"$/g, '').trim(),
            tomMasculino: cols[3].replace(/^"|"$/g, '').trim(),
            tomKaianne: cols[4].replace(/^"|"$/g, '').trim(),
            cifraUrl: cols[5].replace(/^"|"$/g, '').trim(),
            videoUrl: cols[6].replace(/^"|"$/g, '').trim()
        });
    }

    const jsContent = `// Auto-generated from spreadsheet
const SONGS_DATA = ${JSON.stringify(songs, null, 2)};

// Export for browser
if (typeof window !== 'undefined') {
    window.SONGS_DATA = SONGS_DATA;
}
// Export for Node (if needed for testing)
if (typeof module !== 'undefined') {
    module.exports = SONGS_DATA;
}
`;

    fs.writeFileSync(jsPath, jsContent);
    console.log(`Successfully converted ${songs.length} songs to data.js`);

} catch (error) {
    console.error('Error converting CSV:', error);
}
