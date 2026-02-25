const fs = require('fs');
const path = require('path');
const xlsx = require('xlsx');

const excelPath = path.join(__dirname, 'novos_louvores.xlsx');
const jsPath = path.join(__dirname, 'data.js');

try {
    const workbook = xlsx.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const data = xlsx.utils.sheet_to_json(sheet, { defval: "" });

    const songs = [];

    data.forEach(row => {
        // Headers dynamically mapped
        const keys = Object.keys(row);

        let nome = row['NOME'] || row['Nome'] || row[keys[0]];
        let banda = row['BANDA'] || row['Banda'] || row[keys[1]];
        let tomFem = row['TOM FEMININO'] || row['Tom Feminino'] || row[keys[2]] || '';
        let tomMasc = row['TOM MASCULINO'] || row['Tom Masculino'] || row[keys[3]] || '';
        let tomKaia = row['KAIANNE'] || row['Kaianne'] || row[keys[4]] || '';
        let cifraUrl = row['CIFRA'] || row['Cifra'] || row[keys[5]] || '';
        let videoUrl = row['LINK'] || row['Link'] || row[keys[6]] || '';

        if (!nome || typeof nome !== 'string') return;

        songs.push({
            nome: String(nome).trim(),
            banda: String(banda).trim(),
            tomFeminino: String(tomFem).trim(),
            tomMasculino: String(tomMasc).trim(),
            tomKaianne: String(tomKaia).trim(),
            cifraUrl: String(cifraUrl).trim(),
            videoUrl: String(videoUrl).trim()
        });
    });

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
    console.error('Error converting XLSX:', error);
}
