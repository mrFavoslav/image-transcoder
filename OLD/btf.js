const sharp = require("sharp");
const fs = require("fs");
const path = require("path");

const colorMap = {
  '0000': { r: 255, g: 255, b: 255 },
  '0001': { r: 0, g: 0, b: 0 },
  '0010': { r: 255, g: 0, b: 0 },
  '0011': { r: 0, g: 255, b: 0 },
  '0100': { r: 0, g: 0, b: 255 },
  '0101': { r: 255, g: 255, b: 0 },
  '0110': { r: 0, g: 255, b: 255 },
  '0111': { r: 255, g: 0, b: 255 },
  '1000': { r: 128, g: 0, b: 0 },
  '1001': { r: 0, g: 128, b: 0 },
  '1010': { r: 0, g: 0, b: 128 },
  '1011': { r: 255, g: 165, b: 0 },
  '1100': { r: 75, g: 0, b: 130 },
  '1101': { r: 173, g: 255, b: 47 },
  '1110': { r: 255, g: 20, b: 147 },
  '1111': { r: 192, g: 192, b: 192 },
  'A': { r: 128, g: 128, b: 128 },
  'B': { r: 128, g: 128, b: 0 },
  'C': { r: 0, g: 128, b: 128 },
  'D': { r: 128, g: 0, b: 128 }
};

function get4BitIndex(r, g, b) {
  for (let [bitValue, color] of Object.entries(colorMap)) {
    if (
      Math.abs(color.r - r) <= 1 &&
      Math.abs(color.g - g) <= 1 &&
      Math.abs(color.b - b) <= 1
    ) {
      return bitValue;
    }
  }
  return null; // Return null for values not found.
}


async function pixelDecode(imagePath) {
  try {
    const image = sharp(imagePath);
    const { width, height } = await image.metadata();
    const buffer = await image.raw().toBuffer();
    const output = [];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const pixelIndex = (y * width + x) * 3;
        const r = buffer[pixelIndex];
        const g = buffer[pixelIndex + 1];
        const b = buffer[pixelIndex + 2];

        const bitValue = get4BitIndex(r, g, b);

        output.push({ x, y, bitValue });
      }
    }

    return { output, width, height };
  } catch (error) {
    console.error("Cant read", error.message);
  }
}

// ----------------------------------------------------------------

const folderPath = "./out";
let outA = [];

fs.readdir(folderPath, (err, files) => {
  if (err) {
    console.error("What is da folder my nigga", err);
    return;
  }

  files.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  const promises = files.map((file) => {
    const filePath = path.join(folderPath, file);

    return new Promise((resolve, reject) => {
      fs.stat(filePath, (err, stats) => {
        if (err) {
          console.error("Err for file", file, err);
          reject(err);
          return;
        }

        if (stats.isFile()) {
          pixelDecode(filePath)
            .then(({ output }) => {
              resolve(output || []);
            })
            .catch((error) => {
              console.error("Err:", error.message);
              reject(error);
            });
        } else {
          resolve([]);
        }
      });
    });
  });

  function processNibbles(data) {
    const nibbleArray = [];

    data.forEach((item) => {
      const paddedValue = item.bitValue.padStart(
        Math.ceil(item.bitValue.length / 4) * 4,
        "0"
      );
      const nibbles = paddedValue.match(/.{1,4}/g);
      nibbleArray.push(...nibbles);
    });

    return nibbleArray;
  }

  function nibblesToBytes(nibbles) {
    const bytes = [];
    for (let i = 0; i < nibbles.length; i += 2) {
      const high = parseInt(nibbles[i], 2) << 4;
      const low = parseInt(nibbles[i + 1], 2);
      bytes.push(high | low);
    }
    return bytes;
  }

  function convertNibblesToBytes(nibbles) {
    const bytes = [];
    for (let i = 0; i < nibbles.length; i += 2) {
      const highNibble = parseInt(nibbles[i], 2);
      const lowNibble = parseInt(nibbles[i + 1], 2);
      const byte = (highNibble << 4) | lowNibble;
      bytes.push(byte.toString(2).padStart(8, "0"));
    }
    return bytes;
  }

  function decodeBinaryArray(binaryArray) {
    return binaryArray
      .map((binary) => String.fromCharCode(parseInt(binary, 2)))
      .join("");
  }

  function createFileFromNibbles(inputData) {
    const data = [];
    const name = [];
    let readingExt = false;

    function isValidNibble(nibble) {
      return /^[01]{4}$/.test(nibble);
    }

    for (let index = 0; index < inputData.length; index++) {
      const nibble = inputData[index];

      switch (nibble) {
        case "000A":
          readingExt = !readingExt;
          continue;

        case "000D":
          return {
            data: nibblesToBytes(data),
            name: convertNibblesToBytes(name),
          };

        default:
          if (isValidNibble(nibble)) {
            if (readingExt) {
              name.push(nibble);
            } else {
              data.push(nibble);
            }
          }
          break;
      }
    }

    return {
      data: nibblesToBytes(data),
      name: convertNibblesToBytes(name),
    };
  }

  Promise.all(promises)
    .then((results) => {
      outA = results.flat();

      const result = processNibbles(outA);
      const res = createFileFromNibbles(result);

      const dataBytes = (res.data);
      const decodedData = Buffer.from(dataBytes);
      const decodedName = decodeBinaryArray(res.name);

      const folderPath = path.join(__dirname, 'dat_out');
      
      const fileName = decodedName;

      const filePath = path.join(folderPath, fileName);

      fs.writeFileSync(filePath, decodedData);

    })
    .catch((error) => {
      console.error("Err", error);
    });
});
