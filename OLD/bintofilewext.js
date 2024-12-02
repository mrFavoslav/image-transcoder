const fs = require('fs');
const path = require('path');
const prompt = require('prompt-sync')();

async function binaryToFile(binaryData, outputPath) {
    const byteArray = binaryData.split(' ')
        .map(binaryString => parseInt(binaryString, 2));

    const fileBuffer = Buffer.from(byteArray);
    console.log(fileBuffer, "\n")

    const { fileTypeFromBuffer } = await import('file-type');
    const type = await fileTypeFromBuffer(fileBuffer);
    console.log(type);
    let extension = 'bin';
    if (type) {
        extension = type.ext;
    }

    const outputFilePath = `${outputPath}.${extension}`;
    fs.writeFileSync(outputFilePath, fileBuffer);
    console.log(`Soubor byl úspěšně vytvořen na ${outputFilePath} (přípona .${extension})`);
}

const inputFile = prompt("Definuj input soubor: ");
const iFilePath = path.join(__dirname, inputFile);

const data = fs.readFileSync(iFilePath, 'utf8');

const outputFile = prompt("Definuj output soubor bez přípony: ");
const oFilePath = path.join(__dirname, outputFile);

binaryToFile(data, oFilePath).catch(error => {
    console.error('Chyba:', error.message);
});
