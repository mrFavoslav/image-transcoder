### README for Image Transcoder

# Image Transcoder

**Image Transcoder** is a Node.js-based project designed to encode and decode binary data into images and vice versa. It leverages libraries like `sharp` for image processing and provides a modular, worker-thread-based architecture for efficient parallel processing of files.

---

## Features

- **Binary to Image Conversion**: Converts binary data into images using a custom color mapping system.
- **Image to Binary Conversion**: Decodes images back into binary data, supporting file reconstruction.
- **Parallel Processing**: Utilizes worker threads to process multiple files simultaneously for improved performance.
- **Customizable Output**: Supports flexible image dimensions and output directories.
- **File Metadata Encoding**: Encodes file names and metadata into images for easy identification during decoding.
- **Error Handling**: Includes robust error handling for file operations and processing.

---

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/mrFavoslav/image-transcoder.git
   cd image-transcoder
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

---

## Usage

### Binary to Image Conversion

To convert a binary file into images:
```bash
node main/ftb.js <input_file>
```

- **Input**: Specify the file or directory to be converted.
- **Output**: Images will be saved in the `out` directory.

### Image to Binary Conversion

To decode images back into binary files:
```bash
node main/btf.js
```

- **Input**: Images from the `out` directory.
- **Output**: Decoded files will be saved in the `output` directory.

### Additional Options

- `-ct`: Clears the temporary folder before processing.
- `-co`: Clears the output folder before processing.

---

## Project Structure

- **`main/`**: Contains the main scripts for binary-to-image (`ftb.js`) and image-to-binary (`btf.js`) conversion.
- **`workers/`**: Includes worker scripts for parallel processing (`imageWorker.js`, `progressWorker.js`).
- **`OLD/`**: Legacy scripts and files for reference.
- **`out/`**: Stores generated images during binary-to-image conversion.
- **`output/`**: Stores reconstructed files during image-to-binary conversion.
- **`temp/`**: Temporary storage for intermediate files.

---

## Dependencies

The project uses the following Node.js libraries:

- **[sharp](https://sharp.pixelplumbing.com/)**: For image processing.
- **[fs-extra](https://github.com/jprichardson/node-fs-extra)**: For enhanced file system operations.
- **[prompt-sync](https://github.com/heapwolf/prompt-sync)**: For command-line input.
- **[worker_threads](https://nodejs.org/api/worker_threads.html)**: For parallel processing.

To view all dependencies, check the `package.json` file.

---

## How It Works

### Binary to Image Conversion (`ftb.js`)

1. **File Reading**: Reads the binary data from the input file.
2. **Nibble Conversion**: Splits each byte into two 4-bit nibbles.
3. **Color Mapping**: Maps each nibble to a specific RGB color.
4. **Image Generation**: Creates images with the encoded data and saves them in the `out` directory.

### Image to Binary Conversion (`btf.js`)

1. **Image Decoding**: Reads images from the `out` directory.
2. **Color Matching**: Matches pixel colors to their corresponding nibbles.
3. **Binary Reconstruction**: Reconstructs the binary data and saves the output files in the `output` directory.

---

## Example

### Binary to Image
```bash
node main/ftb.js example.txt
```
- Input: `example.txt`
- Output: Images in the `out/` directory.

### Image to Binary
```bash
node main/btf.js
```
- Input: Images from the `out/` directory.
- Output: Reconstructed files in the `output/` directory.

---

## Contributing

Contributions are welcome! If you have ideas for improvements or find any issues, feel free to open an issue or submit a pull request.

---

## License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

---

## Author

Created with ❤️ by **Ondřej Chmelíček** (a.k.a. Favoslav_).  
Check out more about me on [my website](https://www.favoslav.cz/about/).  
