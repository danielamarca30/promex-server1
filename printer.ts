import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs';

// Promisify exec
const execPromise = promisify(exec);

// ESC/POS commands for text formatting
const ESC = '\x1B';  // ESC byte
const GS = '\x1D';   // GS byte

// Text style commands
const RESET = `${ESC}!0`;  // Normal text
const BOLD_ON = `${ESC}E1`; // Bold on
const BOLD_OFF = `${ESC}E0`; // Bold off
const SIZE_NORMAL = `${GS}!0`;  // Normal size
const SIZE_DOUBLE_WIDTH = `${GS}!16`; // Double width
const SIZE_DOUBLE_HEIGHT = `${GS}!32`; // Double height
const SIZE_BIG = `${GS}!48`;  // Double width and height

// New commands
const SET_TOP_MARGIN = `${GS}L0000`; // Set top margin to 0
const FEED_AND_CUT = `${ESC}d${String.fromCharCode(3)}${GS}V0`; // Feed 3 lines and cut

// Ticket content
const message = `
${SET_TOP_MARGIN}
${SIZE_NORMAL}${BOLD_ON}TICKET${BOLD_OFF}
${SIZE_BIG}${BOLD_ON}C - 001${BOLD_OFF}
${SIZE_DOUBLE_WIDTH}${BOLD_ON}CAJA 1${BOLD_OFF}
${SIZE_NORMAL}Fecha: 10/10/2024


`; // Added extra newlines for spacing before cut

// Create a buffer for printing
const ESC_POS_TEXT = Buffer.from(message, 'binary');

// Function to print and cut
const printAndCut = async (printerName: string) => {
  const tempFilePath = '/tmp/print_ticket_temp_file.bin';
  try {
    // Create a file with the message and cut command
    await promisify(writeFile)(tempFilePath, Buffer.concat([ESC_POS_TEXT, Buffer.from(FEED_AND_CUT, 'binary')]));
    
    // Command to send the file to the printer
    const command = `cat ${tempFilePath} | lp -d ${printerName}`;
    const { stdout, stderr } = await execPromise(command);
    
    if (stderr) {
      console.error(`Error: ${stderr}`);
      return;
    }
    
    
    // Delete the temp file
    await promisify(unlink)(tempFilePath);
  } catch (error) {
    console.error(`Error: ${error.message}`);
  }
};

// Printer name (adjust if necessary)
const printerName = 'TM-T20IIIL';

printAndCut(printerName);