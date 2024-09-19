// import { writeFile, unlink } from "node:fs/promises";
// import { exec } from "node:child_process";
// import { promisify } from "node:util";

// const execAsync = promisify(exec);

// async function runCommand(command: string): Promise<string> {
//   try {
//     const { stdout, stderr } = await execAsync(command);
//     if (stderr) console.error(`Error en el comando: ${command}`, stderr);
//     return stdout;
//   } catch (error) {
//     console.error(`Error al ejecutar el comando: ${command}`, error);
//     return '';
//   }
// }

// async function advancedPrinterDiagnostic(printerName: string = 'XP-80C') {
//   console.log(`Diagnóstico avanzado de la impresora ${printerName}...`);

//   try {
//     // Verificar información detallada de la impresora
//     console.log("1. Información detallada de la impresora:");
//     const printerInfo = await runCommand(`wmic printer where name="${printerName}" get /format:list`);
//     console.log(printerInfo);

//     // Verificar el estado del spooler de impresión
//     console.log("\n2. Estado del servicio de cola de impresión:");
//     const spoolerStatus = await runCommand('sc query spooler');
//     console.log(spoolerStatus);

//     // Verificar los puertos USB
//     console.log("\n3. Información de puertos USB:");
//     const usbPorts = await runCommand('powershell "Get-WmiObject Win32_USBControllerDevice | ForEach-Object{[Wmi]($_.Dependent)} | Select-Object Name, DeviceID, PNPClass, Status"');
//     console.log(usbPorts);

//     // Intentar imprimir una página de prueba
//     console.log("\n4. Intentando imprimir una página de prueba:");
//     const testPageResult = await runCommand(`powershell "try { (Get-WmiObject -Query \\"SELECT * FROM Win32_Printer WHERE Name = '${printerName}'\\").PrintTestPage(); Write-Output 'Página de prueba enviada.' } catch { Write-Output $_.Exception.Message }"`);
//     console.log(testPageResult);

//     // Verificar los trabajos de impresión recientes
//     console.log("\n5. Trabajos de impresión recientes:");
//     const recentJobs = await runCommand(`powershell "Get-WinEvent -FilterHashtable @{LogName='Microsoft-Windows-PrintService/Operational'; ID=307} -MaxEvents 5 | Format-List"`);
//     console.log(recentJobs);

//     console.log('\nDiagnóstico avanzado completado. Por favor, verifica si se ha imprimido la página de prueba.');

//   } catch (error) {
//     console.error('Error general durante el diagnóstico avanzado:', error);
//   }
// }

// // Ejecutar la función de diagnóstico avanzado
// advancedPrinterDiagnostic();

import { writeFile, unlink } from "node:fs/promises";
import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

async function runCommand(command: string): Promise<string> {
  try {
    const { stdout, stderr } = await execAsync(command);
    if (stderr) console.error(`Error en el comando: ${command}`, stderr);
    return stdout;
  } catch (error) {
    console.error(`Error al ejecutar el comando: ${command}`, error);
    return '';
  }
}

async function printText(text: string, printerName: string = 'XP-80C') {
  const tempFileName = `print_job_${Date.now()}.txt`;

  try {
    await writeFile(tempFileName, text);

    console.log(`Diagnóstico y impresión para la impresora ${printerName}...`);

    // Verificar si la impresora está instalada
    const installedPrinters = await runCommand('wmic printer get name');
    console.log('Impresoras instaladas:', installedPrinters);
    if (!installedPrinters.includes(printerName)) {
      console.error(`La impresora ${printerName} no está instalada en el sistema.`);
      return;
    }

    // Verificar el estado de la impresora
    const printerStatus = await runCommand(`wmic printer where name="${printerName}" get WorkOffline, PrinterStatus, PrinterState`);
    console.log(`Estado de la impresora ${printerName}:`, printerStatus);

    // Verificar los puertos de la impresora
    const printerPorts = await runCommand(`wmic printer where name="${printerName}" get PortName`);
    console.log(`Puertos de la impresora ${printerName}:`, printerPorts);

    // Método 1: Comando 'print' de Windows
    console.log("Intentando método 1: comando 'print' de Windows");
    const printOutput = await runCommand(`print /d:"${printerName}" "${tempFileName}"`);
    console.log('Salida del comando print:', printOutput);

    // Método 2: PowerShell
    console.log("Intentando método 2: PowerShell");
    const psCommand = `
      $printer = Get-WmiObject -Query "SELECT * FROM Win32_Printer WHERE Name = '${printerName}'";
      if ($printer) {
        $printer.PrintTestPage();
        "Página de prueba enviada a la impresora ${printerName}";
        Get-Content "${tempFileName}" | Out-Printer -Name "${printerName}";
        "Contenido del archivo enviado a la impresora ${printerName}";
      } else {
        "Impresora ${printerName} no encontrada";
      }
    `;
    const psOutput = await runCommand(`powershell -Command "${psCommand}"`);
    console.log('Salida del comando PowerShell:', psOutput);

    // Método 3: Impresión directa al puerto
    console.log("Intentando método 3: Impresión directa al puerto");
    const portName = printerPorts.split('\n')[1].trim();
    if (portName) {
      const directPrintOutput = await runCommand(`copy "${tempFileName}" ${portName}`);
      console.log('Salida de la impresión directa al puerto:', directPrintOutput);
    } else {
      console.log('No se pudo determinar el puerto de la impresora');
    }

    // Verificar la cola de impresión
    console.log("Verificando la cola de impresión");
    const printQueue = await runCommand(`powershell -Command "Get-PrintJob -PrinterName '${printerName}' | Format-List"`);
    console.log('Cola de impresión:', printQueue);

  } catch (error) {
    console.error('Error al imprimir:', error);
  } finally {
    try {
      await unlink(tempFileName);
      console.log('Archivo temporal eliminado');
    } catch (unlinkError) {
      console.error('Error al eliminar el archivo temporal:', unlinkError);
    }
  }
}

// Ejemplo de uso
const textToPrint = `
Hola Mundo!
Este es un ejemplo de texto para imprimir.
La impresora XP-80C está funcionando correctamente.
`;

// Ejecutar la función de impresión
printText(textToPrint);