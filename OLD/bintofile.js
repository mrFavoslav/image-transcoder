const fs = require('fs');
const path = require('path');
const prompt = require('prompt-sync')();

function binaryToFile(binaryData, outputPath) {
    const byteArray = binaryData.split(' ')
        .map(binaryString => parseInt(binaryString, 2));
    
    const fileBuffer = Buffer.from(byteArray);

    fs.writeFileSync(outputPath, fileBuffer);
    console.log(`Soubor byl úspěšně vytvořen na ${outputPath}`);
}

var inputFile = prompt("Definuj input soubor: ");
const iFilePath = path.join(__dirname, inputFile);

const data = fs.readFileSync(iFilePath, 'utf8');

var outputFile = prompt("Definuj output soubor: ");
const oFilePath = path.join(__dirname, outputFile);

try {
    binaryToFile(data, oFilePath);
} catch (error) {
    console.error('Chyba:', error.message);
}