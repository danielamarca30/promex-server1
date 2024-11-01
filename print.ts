import usb from 'usb';
import { USB } from 'escpos';
import * as escpos from 'escpos';

// Identificadores de Vendor ID y Product ID para la impresora EPSON TM-T20III
const VENDOR_ID = 0x04b8;  // Este es un ID común para Epson, pero puede variar
const PRODUCT_ID = 0x0e15; // Este puede variar, necesitarás encontrar el correcto para tu modelo

async function findPrinter() {
  const device = usb.findByIds(VENDOR_ID, PRODUCT_ID);
  if (!device) {
    throw new Error('Impresora no encontrada. Verifica que esté conectada y encendida.');
  }
  return device;
}

async function printTicket() {
  try {
    const device = await findPrinter();
    const usbDevice = new USB(device);
    const printer = new escpos.Printer(usbDevice);

    await new Promise((resolve) => {
      usbDevice.open(() => {
        printer
          .font('a')
          .align('ct')
          .style('bu')
          .size(1, 1)
          .text('Mi Tienda')
          .text('--------------------------------')
          .align('lt')
          .text('Producto 1..................$10.00')
          .text('Producto 2..................$15.00')
          .text('--------------------------------')
          .align('rt')
          .text('Total: $25.00')
          .cut()
          .close(() => {
            
            resolve(null);
          });
      });
    });
  } catch (error) {
    console.error('Error al imprimir:', error);
  }
}

printTicket();