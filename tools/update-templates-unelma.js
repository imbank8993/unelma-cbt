const JSZip = require('jszip');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const logoPath = path.join(ROOT, 'apps', 'web', 'public', 'logo-icon.png');
const logoData = fs.readFileSync(logoPath);

async function updateTemplate(filename) {
    const filePath = path.join(ROOT, 'apps', 'web', 'public', filename);
    const data = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(data);

    // 1. Replace image1.png with unelma logo
    if (zip.file('word/media/image1.png')) {
        zip.file('word/media/image1.png', logoData);
    }

    // 2. Update header1.xml: Add "Unelma Edu Indonesia"
    if (zip.file('word/header1.xml')) {
        let header = await zip.file('word/header1.xml').async('string');
        const textReplacement = '<w:pPr><w:pStyle w:val="Header"/><w:jc w:val="right"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial"/><w:b/><w:color w:val="030C4D"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>Unelma Edu Indonesia</w:t></w:r>';
        
        header = header.replace(
            /(<w:tc><w:tcPr><w:tcW w:w="9392"[^>]*><w:vAlign w:val="center"\/><\/w:tcPr><w:p[^>]*>)(.*?)(<\/w:p><\/w:tc>)/,
            `$1${textReplacement}$3`
        );
        header = header.replace(
            /(<w:tc><w:tcPr><w:tcW w:w="9392"[^>]*><w:vAlign w:val="center"\/><\/w:tcPr><w:p[^>]*\/>)(<\/w:tc>)/,
            `<w:tc><w:tcPr><w:tcW w:w="9392" w:type="dxa"/><w:vAlign w:val="center"/></w:tcPr><w:p>${textReplacement}</w:p></w:tc>`
        );
        zip.file('word/header1.xml', header);
    }

    // 3. Update footer1.xml: Replace with single clean run for unelma.id
    if (zip.file('word/footer1.xml')) {
        let footer = await zip.file('word/footer1.xml').async('string');
        footer = footer.replace(
            /<w:r[^>]*>.*?<\/w:r><w:r[^>]*>.*?\.id<\/w:t><\/w:r>/s,
            '<w:r><w:rPr><w:b/><w:bCs/><w:color w:val="1E3A8A"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr><w:t>unelma.id</w:t></w:r>'
        );
        zip.file('word/footer1.xml', footer);
    }

    const outBuf = await zip.generateAsync({ type: 'nodebuffer' });
    fs.writeFileSync(filePath, outBuf);
    console.log(`[OK] Updated template: ${filename}`);
}

(async () => {
    await updateTemplate('template_soal_pengetahuan.docx');
    await updateTemplate('template_soal_kepribadian.docx');
    console.log('All Word templates successfully updated with Unelma branding!');
})();
