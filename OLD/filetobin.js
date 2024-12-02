const fs = require('fs');
const path = require('path');
const prompt = require('prompt-sync')();

function convertFileToBinary(filePath) {
    if (!fs.existsSync(filePath)) {
        throw new Error('Soubor neexistuje.');
    }

    const fileBuffer = fs.readFileSync(filePath);
    
    const binaryData = Array.from(fileBuffer)
        .map(byte => byte.toString(2).padStart(8, '0'))
        .join(' ');
    return binaryData;
}

var inputFile = prompt("Definuj input soubor: ");
const iFilePath = path.join(__dirname, inputFile);

var outputFile = prompt("Definuj output soubor: ");
const oFilePath = path.join(__dirname, outputFile);

try {
    const binaryData = convertFileToBinary(iFilePath);
    // console.log('Binární data:');
    // console.log(binaryData);
    fs.writeFileSync(oFilePath, binaryData);
    console.log(`Data zapsána do ${oFilePath}`);
} catch (error) {
    console.error('Chyba:', error.message);
}
