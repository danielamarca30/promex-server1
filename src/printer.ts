import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink } from 'fs';

const execPromise = promisify(exec);

// ESC/POS commands in hexadecimal
const ESC = '\x1B';
const GS = '\x1D';
const LF = '\x0A';

// Text formatting commands
const RESET = `${ESC}@`;
const ALIGN_LEFT = `${ESC}a\x00`;
const ALIGN_CENTER = `${ESC}a\x01`;
const BOLD_ON = `${ESC}E\x01`;
const BOLD_OFF = `${ESC}E\x00`;
const SIZE_NORMAL = `${GS}!\x00`;
const SIZE_INTERMEDIATE = `${GS}!\x08`;
const SIZE_LARGE_INTERMEDIATE = `${GS}!\x0C`;
const SIZE_DOUBLE_WIDTH = `${GS}!\x10`;
const SIZE_DOUBLE_HEIGHT = `${GS}!\x20`;
const SIZE_BIG = `${GS}!\x30`;
const SIZE_LARGE = `${GS}!\x75`;  // Intermediate size for the ticket number

// Font selection (if supported by the printer)
const FONT_A = `${ESC}M\x00`;
const FONT_B = `${ESC}M\x01`;  // Usually a more condensed font
const FONT_C = `${ESC}M\x02`;  // Some printers support a third font
const FONT_D = `${ESC}M\x03`;  // Some printers support a third font

// Cut command
const CUT_PAPER = `${GS}V\x41\x03`;

interface TicketInfo {
  ticketNumber: string;
  servicePoint: string;
  date: string;
}

// Function to get current time
const getCurrentTime = (): string => {
  const now = new Date();
  return now.toTimeString().split(' ')[0];
};

// Function to create ticket content
// const createTicketContent = ({ ticketNumber, servicePoint, date }: TicketInfo): string => {
//   const currentTime = getCurrentTime();
//   return `${RESET}${ALIGN_CENTER}
// ${SIZE_NORMAL}${BOLD_ON}P R O M E X - B O L${BOLD_OFF}${LF}
// ${FONT_B}${SIZE_LARGE}${BOLD_ON}${ticketNumber}${BOLD_OFF}${LF}${FONT_C}
// ${SIZE_DOUBLE_HEIGHT}${BOLD_ON}Servicio: ${servicePoint}${BOLD_OFF}
// ${SIZE_NORMAL}Fecha: ${date} Hora: ${currentTime}
// ${SIZE_DOUBLE_WIDTH}Bienvenido, Gracias por Trabajar con nosotros...!
// ${LF}${CUT_PAPER}`;
// };
const createTicketContent = ({ ticketNumber, servicePoint, date }: TicketInfo): string => {
  const currentTime = getCurrentTime();
  return `${RESET}${ALIGN_CENTER}
${SIZE_NORMAL}${BOLD_ON}Bienvenido a PROMEX-BOL${BOLD_OFF}
${FONT_B}${SIZE_NORMAL}---------------------------------------------------------------
${FONT_B}${SIZE_LARGE}${BOLD_ON}${ticketNumber}${BOLD_OFF}
${FONT_B}${SIZE_NORMAL}---------------------------------------------------------------${FONT_C}
${SIZE_DOUBLE_HEIGHT}${BOLD_ON}Servicio: ${servicePoint}${BOLD_OFF}
${SIZE_NORMAL}Fecha: ${date} Hora: ${currentTime}
${SIZE_DOUBLE_WIDTH}Gracias por su preferencia
${LF}${CUT_PAPER}`;
};

// Function to print and cut
export const printTicket = async (printerName: string, ticketInfo: TicketInfo): Promise<void> => {
  const tempFilePath = '/tmp/print_ticket_temp_file.bin';
  try {
    const ticketContent = createTicketContent(ticketInfo);
    const ESC_POS_TEXT = Buffer.from(ticketContent, 'binary');

    await promisify(writeFile)(tempFilePath, ESC_POS_TEXT);
    
    const command = `cat ${tempFilePath} | lp -d ${printerName}`;
    const { stdout, stderr } = await execPromise(command);
    
    if (stderr) {
      console.error(`Error: ${stderr}`);
      return;
    }
    
    
    await promisify(unlink)(tempFilePath);
  } catch (error:any) {
    console.error(`Error: ${error.message}`);
  }
};

// Example usage (commented out as this is now a module)
// const printerName = 'TM-T20IIIL';
// printTicket(printerName, {
//   ticketNumber: 'C - 001',
//   servicePoint: 'CAJA 1',
//   date: '10/10/2024'
// });