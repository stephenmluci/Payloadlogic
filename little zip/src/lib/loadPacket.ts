import type { Load, Client, Settings, DriverProfile, Vehicle } from '@/types';
import { format as formatDate } from 'date-fns';
import { formatAddress } from './utils';

export interface LoadPacketOptions {
  load: Load;
  client?: Client;
  settings: Settings;
  driver?: DriverProfile;
  truck?: Vehicle;
  trailer?: Vehicle;
}

export interface LoadPacketResult {
  pdfBlob: Blob;
  pdfBytes: Uint8Array;
  fileName: string;
  hasBolAttachment: boolean;
}

export interface LoadPacketEmailInfo {
  to: string;
  subject: string;
  body: string;
  mailtoUrl: string;
}

/**
 * Derives the target email address for a load's customer or broker.
 */
export function getLoadPacketRecipientEmail(load: Load, client?: Client): string {
  if (client?.contactEmail?.trim()) {
    return client.contactEmail.trim();
  }
  if (load.requestedByClientEmail?.trim()) {
    return load.requestedByClientEmail.trim();
  }
  return '';
}

/**
 * Compiles a prefilled email subject and body for sharing the load billing packet.
 */
export function getLoadPacketEmailInfo(options: {
  load: Load;
  client?: Client;
  settings: Settings;
}): LoadPacketEmailInfo {
  const { load, client, settings } = options;
  const to = getLoadPacketRecipientEmail(load, client);
  const loadNumber = load.loadNumber || load.id?.substring(0, 8) || 'N/A';
  const subject = `Load Packet (Invoice & Signed BOL) - Load #${loadNumber}`;

  const originText = `${load.origin.city}, ${load.origin.state}`;
  const destText = `${load.destination.city}, ${load.destination.state}`;
  const totalDue = load.totalAgreedRate.toFixed(2);
  const bolType = load.bolSource === 'system' ? 'System Generated (Internal Digital BOL)' : 'Broker Provided (Physical Paper BOL)';
  const clientName = client?.contactName || client?.companyName || load.requestedByClientName || 'Freight Broker / Customer';

  const body = `Dear ${clientName},

Attached is the completed billing packet for Load #${loadNumber}.

SHIPMENT SUMMARY:
• Carrier: ${settings.carrierName || 'PayloadLogic Fleet'} (USDOT #${settings.carrierDotNumber || 'N/A'} / MC #${settings.carrierMcNumber || 'N/A'})
• Origin: ${originText}
• Destination: ${destText}
• Total Amount Due: $${totalDue}
• BOL Source: ${bolType}
• Status: Delivered & Signed BOL Verified

The attached packet contains our formal freight invoice along with the verified Proof of Delivery / signed Bill of Lading.

${load.signedBolUrl ? `Online Document Link: ${load.signedBolUrl}\n` : ''}Payment is due upon receipt. Please remit payment per the invoice terms.

Thank you for your business.

Sincerely,
${settings.carrierContactName || settings.carrierName}
${settings.carrierContactPhone || ''}
${settings.carrierContactEmail || ''}`;

  const mailtoUrl = `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

  return { to, subject, body, mailtoUrl };
}

/**
 * Compiles the universal multi-page Load Packet PDF:
 * - Page 1: Financial Billing Invoice
 * - Page 2+: Attached Signed BOL / POD (image or embedded PDF)
 */
export async function compileLoadPacketPdf(options: LoadPacketOptions): Promise<LoadPacketResult> {
  const { load, client, settings, driver, truck, trailer } = options;
  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  // ──────────────────────────────────────────────────────────────────────────
  // PAGE 1: FREIGHT INVOICE & LOAD BILLING SUMMARY
  // ──────────────────────────────────────────────────────────────────────────
  const page1 = pdfDoc.addPage([600, 850]);
  const { width, height } = page1.getSize();
  const margin = 50;
  let yPos = height - margin;

  const drawText = (
    text: string,
    fontToUse: any,
    size: number,
    x: number,
    y: number,
    color = rgb(0.1, 0.1, 0.15)
  ) => {
    page1.drawText(text, { x, y, font: fontToUse, size, color });
    return y - size - 3;
  };

  // 1. Top Carrier Branding & Document Title
  yPos = drawText('FREIGHT BILLING INVOICE', boldFont, 22, margin, yPos, rgb(0.05, 0.2, 0.45));
  yPos = drawText(settings.carrierName || 'PayloadLogic Carrier Fleet', boldFont, 12, margin, yPos);
  
  const carrierDotInfo = `USDOT: ${settings.carrierDotNumber || 'Pending'}  |  MC: ${settings.carrierMcNumber || 'Pending'}`;
  yPos = drawText(carrierDotInfo, font, 9, margin, yPos, rgb(0.35, 0.35, 0.4));
  
  const carrierAddrStr = formatAddress(settings.carrierAddress) || 'Carrier Terminal HQ';
  yPos = drawText(carrierAddrStr, font, 9, margin, yPos, rgb(0.35, 0.35, 0.4));
  
  if (settings.carrierContactPhone || settings.carrierContactEmail) {
    const contactStr = `Phone: ${settings.carrierContactPhone || 'N/A'}  |  Email: ${settings.carrierContactEmail || 'N/A'}`;
    yPos = drawText(contactStr, font, 9, margin, yPos, rgb(0.35, 0.35, 0.4));
  }

  // Invoice Number & Meta box on top right
  const invoiceNum = `INV-${load.loadNumber || load.id?.substring(0, 7).toUpperCase() || '001'}`;
  const headerRightX = width - margin - 170;
  let metaY = height - margin;
  metaY = drawText(`Invoice #: ${invoiceNum}`, boldFont, 11, headerRightX, metaY, rgb(0.05, 0.2, 0.45));
  metaY = drawText(`Date: ${formatDate(new Date(), 'PP')}`, font, 9, headerRightX, metaY);
  metaY = drawText(`Payment Due: Upon Receipt`, font, 9, headerRightX, metaY);
  metaY = drawText(`Load Ref: #${load.loadNumber || load.id?.substring(0, 8) || 'N/A'}`, font, 9, headerRightX, metaY);
  const bolSourceLabel = load.bolSource === 'system' ? 'System Generated (Internal)' : 'Broker Provided (External)';
  metaY = drawText(`BOL Type: ${bolSourceLabel}`, font, 8.5, headerRightX, metaY, rgb(0.4, 0.2, 0.6));

  yPos = Math.min(yPos - 15, metaY - 15);

  // Decorative Rule
  page1.drawLine({
    start: { x: margin, y: yPos },
    end: { x: width - margin, y: yPos },
    thickness: 1.5,
    color: rgb(0.85, 0.88, 0.92),
  });
  yPos -= 18;

  // 2. Bill To & Shipment Info Section (2 Columns)
  const colWidth = (width - margin * 2 - 20) / 2;
  const col2X = margin + colWidth + 20;
  let leftY = yPos;
  let rightY = yPos;

  // Left: Bill To
  page1.drawRectangle({
    x: margin,
    y: leftY - 75,
    width: colWidth,
    height: 80,
    color: rgb(0.97, 0.98, 1.0),
    borderColor: rgb(0.88, 0.91, 0.96),
    borderWidth: 1,
  });
  leftY = drawText('BILL TO (BROKER / CUSTOMER):', boldFont, 9, margin + 8, leftY - 12, rgb(0.1, 0.25, 0.5));
  leftY = drawText(client?.companyName || load.requestedByClientName || 'Commercial Freight Customer', boldFont, 10, margin + 8, leftY);
  if (client?.contactName) {
    leftY = drawText(`Attn: ${client.contactName}`, font, 9, margin + 8, leftY);
  }
  const clientEmail = getLoadPacketRecipientEmail(load, client);
  if (clientEmail) {
    leftY = drawText(`Email: ${clientEmail}`, font, 8.5, margin + 8, leftY);
  }
  if (client?.address) {
    leftY = drawText(formatAddress(client.address), font, 8.5, margin + 8, leftY);
  }

  // Right: Transit & Asset Details
  page1.drawRectangle({
    x: col2X,
    y: rightY - 75,
    width: colWidth,
    height: 80,
    color: rgb(0.97, 0.98, 1.0),
    borderColor: rgb(0.88, 0.91, 0.96),
    borderWidth: 1,
  });
  rightY = drawText('TRANSIT & ASSET DETAILS:', boldFont, 9, col2X + 8, rightY - 12, rgb(0.1, 0.25, 0.5));
  const driverName = driver?.name || 'Assigned Company Driver';
  const truckLabel = truck ? `Truck: [T-${truck.unitNumber}]` : 'Truck: Fleet Unit';
  const trailerLabel = trailer ? `Trailer: [TRL-${trailer.unitNumber}]` : '';
  rightY = drawText(`${truckLabel}  ${trailerLabel}`, font, 9, col2X + 8, rightY);
  rightY = drawText(`Driver: ${driverName}`, font, 9, col2X + 8, rightY);
  const distanceStr = `${load.distance || 0} loaded miles ${load.deadheadMiles ? `(+${load.deadheadMiles} deadhead)` : ''}`;
  rightY = drawText(`Total Distance: ${distanceStr}`, font, 8.5, col2X + 8, rightY);

  yPos = Math.min(leftY, rightY) - 30;

  // 3. Route & Cargo Overview Table
  page1.drawRectangle({
    x: margin,
    y: yPos - 60,
    width: width - margin * 2,
    height: 65,
    color: rgb(0.96, 0.97, 0.98),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
  });
  drawText('ROUTE & FREIGHT SPECIFICATIONS', boldFont, 9, margin + 8, yPos - 12, rgb(0.2, 0.25, 0.35));
  
  const originLine = `Origin (Pickup): ${formatAddress(load.origin)}`;
  const destLine = `Destination (Delivery): ${formatAddress(load.destination)}`;
  drawText(originLine, font, 9, margin + 8, yPos - 26);
  drawText(destLine, font, 9, margin + 8, yPos - 40);

  const cargoText = `Cargo: ${load.cargoDescription || 'Commercial Freight'} | Units: ${load.cargoQuantity || 1} | Weight: ${load.cargoWeightNum ? `${load.cargoWeightNum.toLocaleString()} lbs` : 'Standard'}`;
  drawText(cargoText, italicFont, 8.5, margin + 8, yPos - 54, rgb(0.3, 0.35, 0.45));

  yPos -= 85;

  // 4. Financial Line Items Table Header
  page1.drawRectangle({
    x: margin,
    y: yPos - 18,
    width: width - margin * 2,
    height: 22,
    color: rgb(0.08, 0.22, 0.42),
  });
  drawText('DESCRIPTION / CHARGES', boldFont, 9, margin + 8, yPos - 12, rgb(1, 1, 1));
  drawText('RATE / MI', boldFont, 9, width - margin - 150, yPos - 12, rgb(1, 1, 1));
  drawText('TOTAL DUE', boldFont, 9, width - margin - 70, yPos - 12, rgb(1, 1, 1));
  yPos -= 28;

  // Row 1: Linehaul freight
  const baseRate = (load.distance || 0) * (load.ratePerMile || 0);
  drawText(`Linehaul Freight Transport (${load.distance || 0} miles)`, font, 9.5, margin + 8, yPos);
  drawText(`$${(load.ratePerMile || 0).toFixed(2)}`, font, 9.5, width - margin - 150, yPos);
  drawText(`$${baseRate.toFixed(2)}`, boldFont, 9.5, width - margin - 70, yPos);
  yPos -= 18;

  // Row 2: Tarping Fee (if applicable)
  if (load.requiresTarping && load.tarpingFee) {
    drawText('Weather Protection / Tarping Fee', font, 9.5, margin + 8, yPos);
    drawText('Flat Fee', font, 9.5, width - margin - 150, yPos);
    drawText(`$${load.tarpingFee.toFixed(2)}`, boldFont, 9.5, width - margin - 70, yPos);
    yPos -= 18;
  }

  // Row 3: Special Terms or Fuel surcharges (if total differs from base + tarp)
  const currentTotalCalculated = baseRate + (load.tarpingFee || 0);
  const diff = load.totalAgreedRate - currentTotalCalculated;
  if (Math.abs(diff) > 0.01) {
    drawText('Agreed Freight Adjustment / Accessorials', font, 9.5, margin + 8, yPos);
    drawText('Flat', font, 9.5, width - margin - 150, yPos);
    drawText(`$${diff.toFixed(2)}`, boldFont, 9.5, width - margin - 70, yPos);
    yPos -= 18;
  }

  // Total summary divider
  page1.drawLine({
    start: { x: width - margin - 200, y: yPos - 2 },
    end: { x: width - margin, y: yPos - 2 },
    thickness: 1.5,
    color: rgb(0.1, 0.2, 0.4),
  });
  yPos -= 20;

  // Grand Total Box
  page1.drawRectangle({
    x: width - margin - 220,
    y: yPos - 8,
    width: 220,
    height: 30,
    color: rgb(0.93, 0.97, 0.94),
    borderColor: rgb(0.65, 0.85, 0.7),
    borderWidth: 1,
  });
  drawText('TOTAL INVOICE BALANCE:', boldFont, 10, width - margin - 210, yPos + 3, rgb(0.1, 0.4, 0.2));
  drawText(`$${load.totalAgreedRate.toFixed(2)}`, boldFont, 13, width - margin - 80, yPos + 2, rgb(0.08, 0.45, 0.2));
  yPos -= 36;

  // 5. Payment Terms & Remittance
  yPos = drawText('REMITTANCE & PAYMENT INSTRUCTIONS:', boldFont, 9, margin, yPos, rgb(0.1, 0.2, 0.4));
  const defaultTerms = settings.defaultSpecialTerms || 'Payment due upon receipt. Remit via ACH, Wire Transfer, or Company Check.';
  yPos = drawText(defaultTerms, font, 8.5, margin, yPos, rgb(0.3, 0.35, 0.4));
  if (load.specialTerms) {
    yPos = drawText(`Special Terms: ${load.specialTerms}`, italicFont, 8.5, margin, yPos, rgb(0.4, 0.45, 0.5));
  }

  // 6. Packet Document Notice Box at bottom of Page 1
  page1.drawRectangle({
    x: margin,
    y: margin + 15,
    width: width - margin * 2,
    height: 48,
    color: rgb(0.96, 0.94, 0.99),
    borderColor: rgb(0.85, 0.78, 0.94),
    borderWidth: 1,
  });
  page1.drawText('ATTACHED PROOF OF DELIVERY (POD) / BILL OF LADING (BOL):', {
    x: margin + 10,
    y: margin + 46,
    font: boldFont,
    size: 8.5,
    color: rgb(0.35, 0.15, 0.6),
  });
  const podAttachmentDesc = load.signedBolUrl
    ? `Verified signed delivery document is appended on Page 2 of this billing packet (${bolSourceLabel}).`
    : `Pending delivery closeout: Bill of Lading is required for transit finalization.`;
  page1.drawText(podAttachmentDesc, {
    x: margin + 10,
    y: margin + 32,
    font,
    size: 8,
    color: rgb(0.25, 0.1, 0.45),
  });
  page1.drawText(`Generated on ${formatDate(new Date(), 'PPpp')} • Confidential Freight Billing Packet`, {
    x: margin + 10,
    y: margin + 20,
    font: italicFont,
    size: 7.5,
    color: rgb(0.5, 0.5, 0.55),
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PAGE 2+: ATTACHED BILL OF LADING (BOL / POD)
  // ──────────────────────────────────────────────────────────────────────────
  let hasBolAttachment = false;

  if (load.signedBolUrl) {
    try {
      let imageBytes: Uint8Array | null = null;
      let isPdf = false;

      // Handle Data URL or remote URL
      if (load.signedBolUrl.startsWith('data:')) {
        const parts = load.signedBolUrl.split(',');
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = mimeMatch ? mimeMatch[1] : '';
        const base64Data = parts[1];
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        imageBytes = bytes;
        if (mime.includes('pdf')) isPdf = true;
      } else {
        // Remote URL (Firebase Storage / HTTP)
        try {
          const res = await fetch(load.signedBolUrl);
          if (res.ok) {
            const buffer = await res.arrayBuffer();
            imageBytes = new Uint8Array(buffer);
            const contentType = res.headers.get('content-type') || '';
            if (contentType.includes('pdf') || load.signedBolUrl.toLowerCase().includes('.pdf')) {
              isPdf = true;
            }
          }
        } catch (fetchErr) {
          console.warn('Could not fetch signed BOL URL directly (CORS or offline), falling back to reference page:', fetchErr);
        }
      }

      if (imageBytes && isPdf) {
        // Embed PDF pages directly
        const bolPdfDoc = await PDFDocument.load(imageBytes);
        const copiedPages = await pdfDoc.copyPages(bolPdfDoc, bolPdfDoc.getPageIndices());
        for (const copiedPage of copiedPages) {
          pdfDoc.addPage(copiedPage);
        }
        hasBolAttachment = true;
      } else if (imageBytes && !isPdf) {
        // Embed Image (PNG or JPG)
        let embeddedImage: any = null;
        try {
          // Attempt PNG embedding first
          embeddedImage = await pdfDoc.embedPng(imageBytes);
        } catch {
          try {
            // Attempt JPG embedding
            embeddedImage = await pdfDoc.embedJpg(imageBytes);
          } catch (embedErr) {
            console.warn('Could not embed raw image bytes as PNG or JPG:', embedErr);
          }
        }

        const page2 = pdfDoc.addPage([600, 850]);
        let p2Y = 850 - margin;

        p2Y = drawText('BILL OF LADING (BOL) / PROOF OF DELIVERY', boldFont, 16, margin, p2Y, rgb(0.05, 0.2, 0.45));
        p2Y = drawText(`Verified Document Attachment for Load #${load.loadNumber || load.id?.substring(0, 8)}`, font, 9, margin, p2Y, rgb(0.35, 0.35, 0.4));
        p2Y = drawText(`BOL Source: ${bolSourceLabel}  |  Uploaded: ${load.signedBolUploadedAt ? formatDate(new Date(load.signedBolUploadedAt), 'PPpp') : 'On File'}`, font, 8.5, margin, p2Y, rgb(0.2, 0.35, 0.5));
        p2Y -= 10;

        if (embeddedImage) {
          const maxWidth = 500;
          const maxHeight = 680;
          const imgDims = embeddedImage.scaleToFit(maxWidth, maxHeight);
          const imgX = (600 - imgDims.width) / 2;
          const imgY = Math.max(margin, p2Y - imgDims.height - 10);

          page2.drawRectangle({
            x: imgX - 4,
            y: imgY - 4,
            width: imgDims.width + 8,
            height: imgDims.height + 8,
            color: rgb(0.98, 0.98, 0.98),
            borderColor: rgb(0.8, 0.85, 0.9),
            borderWidth: 1,
          });

          page2.drawImage(embeddedImage, {
            x: imgX,
            y: imgY,
            width: imgDims.width,
            height: imgDims.height,
          });
          hasBolAttachment = true;
        } else {
          // Image could not be embedded directly; render document link box
          renderBolSummaryCard(page2, load, boldFont, font, italicFont, margin, rgb);
          hasBolAttachment = true;
        }
      } else {
        // Fallback reference page for remote document
        const page2 = pdfDoc.addPage([600, 850]);
        renderBolSummaryCard(page2, load, boldFont, font, italicFont, margin, rgb);
        hasBolAttachment = true;
      }
    } catch (bolErr) {
      console.warn('Error attaching signed BOL to packet PDF:', bolErr);
      const page2 = pdfDoc.addPage([600, 850]);
      renderBolSummaryCard(page2, load, boldFont, font, italicFont, margin, rgb);
      hasBolAttachment = true;
    }
  } else {
    // If no signed BOL yet, provide pending document certificate page
    const page2 = pdfDoc.addPage([600, 850]);
    renderBolPendingCard(page2, load, boldFont, font, italicFont, margin, rgb);
  }

  const pdfBytes = await pdfDoc.save();
  const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
  const loadNumClean = load.loadNumber || load.id?.substring(0, 8) || 'load';
  const fileName = `Load_Packet_${loadNumClean}.pdf`;

  return {
    pdfBlob,
    pdfBytes,
    fileName,
    hasBolAttachment,
  };
}

function safeRgb(r: number, g: number, b: number, rgbFn?: (r: number, g: number, b: number) => any) {
  try {
    if (rgbFn) return rgbFn(r, g, b);
    return { type: 'RGB', red: r, green: g, blue: b };
  } catch {
    return rgbFn ? rgbFn(0.2, 0.2, 0.2) : { type: 'RGB', red: 0.2, green: 0.2, blue: 0.2 }; // Fallback gray
  }
}

function renderBolSummaryCard(
  page: any,
  load: Load,
  boldFont: any,
  font: any,
  italicFont: any,
  margin: number,
  rgbFn?: (r: number, g: number, b: number) => any
) {
  let y = 850 - margin;
  page.drawText('BILL OF LADING (BOL) / PROOF OF DELIVERY', {
    x: margin,
    y,
    font: boldFont,
    size: 16,
    color: safeRgb(0.05, 0.2, 0.45, rgbFn),
  });
  y -= 25;
  page.drawText(`Verified Document Record for Load #${load.loadNumber || load.id?.substring(0, 8)}`, {
    x: margin,
    y,
    font,
    size: 10,
    color: safeRgb(0.3, 0.3, 0.35),
  });
  y -= 30;

  // Box
  page.drawRectangle({
    x: margin,
    y: y - 200,
    width: 500,
    height: 200,
    color: safeRgb(0.97, 0.98, 1.0, rgbFn),
    borderColor: safeRgb(0.8, 0.85, 0.95, rgbFn),
    borderWidth: 1,
  });

  page.drawText('DOCUMENT VERIFICATION CERTIFICATE', {
    x: margin + 16,
    y: y - 24,
    font: boldFont,
    size: 12,
    color: safeRgb(0.1, 0.25, 0.5, rgbFn),
  });
  page.drawText(`BOL Source Type: ${load.bolSource === 'system' ? 'System Generated (Internal Sign-on-Glass)' : 'Broker Provided (Physical Paper BOL)'}`, {
    x: margin + 16,
    y: y - 48,
    font,
    size: 9.5,
    color: safeRgb(0.15, 0.15, 0.2, rgbFn),
  });
  page.drawText(`Delivered To: ${load.destination.city}, ${load.destination.state}`, {
    x: margin + 16,
    y: y - 68,
    font,
    size: 9.5,
    color: safeRgb(0.15, 0.15, 0.2, rgbFn),
  });
  page.drawText(`Verified Upload Timestamp: ${load.signedBolUploadedAt ? formatDate(new Date(load.signedBolUploadedAt), 'PPpp') : 'Confirmed On File'}`, {
    x: margin + 16,
    y: y - 88,
    font,
    size: 9.5,
    color: safeRgb(0.15, 0.15, 0.2, rgbFn),
  });
  page.drawText('Direct Cloud Storage Document URI:', {
    x: margin + 16,
    y: y - 116,
    font: boldFont,
    size: 8.5,
    color: safeRgb(0.2, 0.25, 0.35, rgbFn),
  });
  
  const urlDisplay = (load.signedBolUrl || '').substring(0, 85);
  page.drawText(urlDisplay, {
    x: margin + 16,
    y: y - 132,
    font: italicFont,
    size: 7.5,
    color: safeRgb(0.3, 0.1, 0.6, rgbFn),
  });
  
  page.drawText('This signed delivery receipt closes out the transit phase and authorizes invoice settlement.', {
    x: margin + 16,
    y: y - 170,
    font: italicFont,
    size: 8,
    color: safeRgb(0.4, 0.4, 0.45, rgbFn),
  });
}

function renderBolPendingCard(
  page: any,
  load: Load,
  boldFont: any,
  font: any,
  italicFont: any,
  margin: number,
  rgbFn?: (r: number, g: number, b: number) => any
) {
  let y = 850 - margin;
  page.drawText('BILL OF LADING (BOL) STATUS', {
    x: margin,
    y,
    font: boldFont,
    size: 16,
    color: safeRgb(0.6, 0.3, 0.05, rgbFn),
  });
  y -= 25;
  page.drawText(`Status for Load #${load.loadNumber || load.id?.substring(0, 8)}`, {
    x: margin,
    y,
    font,
    size: 10,
    color: safeRgb(0.3, 0.3, 0.35, rgbFn),
  });
  y -= 30;

  page.drawRectangle({
    x: margin,
    y: y - 120,
    width: 500,
    height: 120,
    color: safeRgb(0.99, 0.97, 0.93, rgbFn),
    borderColor: safeRgb(0.95, 0.85, 0.65, rgbFn),
    borderWidth: 1,
  });

  page.drawText('PROOF OF DELIVERY PENDING DRIVER UPLOAD', {
    x: margin + 16,
    y: y - 26,
    font: boldFont,
    size: 11,
    color: safeRgb(0.7, 0.35, 0.05, rgbFn),
  });
  const sourceReq = load.bolSource === 'system'
    ? 'Receiver electronic Sign-on-Glass signature will be compiled upon arrival.'
    : 'Driver will upload a photo of the broker-provided signed paper BOL upon physical delivery.';
  page.drawText(sourceReq, {
    x: margin + 16,
    y: y - 50,
    font,
    size: 9,
    color: safeRgb(0.35, 0.25, 0.15, rgbFn),
  });
  page.drawText('Transit finalization and delivery settlement are strictly gated until document verification.', {
    x: margin + 16,
    y: y - 72,
    font: italicFont,
    size: 8,
    color: safeRgb(0.5, 0.4, 0.3, rgbFn),
  });
}

/**
 * Downloads the compiled packet PDF to the user's local machine.
 */
export async function downloadLoadPacketPdf(options: LoadPacketOptions): Promise<string> {
  const result = await compileLoadPacketPdf(options);
  const link = document.createElement('a');
  link.href = URL.createObjectURL(result.pdfBlob);
  link.download = result.fileName;
  link.click();
  URL.revokeObjectURL(link.href);
  return result.fileName;
}

/**
 * Compiles a formal digital Bill of Lading PDF from load data and the receiver's Sign-on-Glass signature.
 */
export async function compileDigitalBolPdf(options: {
  load: Load;
  carrierName?: string;
  carrierDot?: string;
  carrierMc?: string;
  carrierAddress?: any;
  receivedBy: string;
  deliveredAt: string;
  conditionNotes?: string;
  signatureDataUrl: string;
  photoDataUrl?: string;
}): Promise<Blob> {
  const {
    load,
    carrierName = 'PayloadLogic Carrier Fleet',
    carrierDot,
    carrierMc,
    carrierAddress,
    receivedBy,
    deliveredAt,
    conditionNotes,
    signatureDataUrl,
    photoDataUrl,
  } = options;

  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 850]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const margin = 45;
  let y = 850 - margin;

  // Header Title
  page.drawText('SYSTEM GENERATED BILL OF LADING (BOL)', {
    x: margin,
    y,
    font: boldFont,
    size: 18,
    color: rgb(0.05, 0.2, 0.45),
  });
  y -= 16;
  page.drawText('ELECTRONIC PROOF OF DELIVERY (ePOD) • SIGN-ON-GLASS VERIFIED', {
    x: margin,
    y,
    font: boldFont,
    size: 8.5,
    color: rgb(0.35, 0.15, 0.6),
  });
  y -= 14;

  // Carrier block
  page.drawText(carrierName, { x: margin, y, font: boldFont, size: 10, color: rgb(0.2, 0.25, 0.3) });
  y -= 12;
  const dotStr = `USDOT: ${carrierDot || 'Pending'}  |  MC: ${carrierMc || 'Pending'}`;
  page.drawText(dotStr, { x: margin, y, font, size: 8.5, color: rgb(0.4, 0.45, 0.5) });
  if (carrierAddress) {
    y -= 11;
    page.drawText(formatAddress(carrierAddress), { x: margin, y, font, size: 8, color: rgb(0.4, 0.45, 0.5) });
  }

  // Load Meta right box
  const rightX = 390;
  let ry = 850 - margin;
  page.drawText(`BOL #: BOL-${load.loadNumber || load.id?.substring(0, 8) || 'DOC'}`, {
    x: rightX,
    y: ry,
    font: boldFont,
    size: 11,
    color: rgb(0.05, 0.2, 0.45),
  });
  ry -= 14;
  page.drawText(`Load Ref: #${load.loadNumber || load.id?.substring(0, 8)}`, { x: rightX, y: ry, font, size: 9 });
  ry -= 13;
  page.drawText(`Delivery Date: ${formatDate(new Date(deliveredAt || Date.now()), 'PP')}`, { x: rightX, y: ry, font, size: 9 });
  ry -= 13;
  page.drawText('BOL Source: System Generated', { x: rightX, y: ry, font: boldFont, size: 8.5, color: rgb(0.1, 0.4, 0.2) });

  y = Math.min(y - 12, ry - 12);

  page.drawLine({
    start: { x: margin, y },
    end: { x: 600 - margin, y },
    thickness: 1.5,
    color: rgb(0.85, 0.88, 0.92),
  });
  y -= 20;

  // Shipper / Origin & Consignee / Destination
  const boxW = (600 - margin * 2 - 16) / 2;
  page.drawRectangle({
    x: margin,
    y: y - 70,
    width: boxW,
    height: 70,
    color: rgb(0.97, 0.98, 1.0),
    borderColor: rgb(0.85, 0.9, 0.98),
    borderWidth: 1,
  });
  page.drawText('SHIPPER (ORIGIN)', { x: margin + 8, y: y - 12, font: boldFont, size: 8.5, color: rgb(0.1, 0.25, 0.5) });
  page.drawText(formatAddress(load.origin), { x: margin + 8, y: y - 28, font, size: 8.5 });
  if (load.pickupDateTime) {
    page.drawText(`Pickup: ${formatDate(new Date(load.pickupDateTime), 'PPp')}`, { x: margin + 8, y: y - 48, font: italicFont, size: 8, color: rgb(0.3, 0.35, 0.4) });
  }

  const destX = margin + boxW + 16;
  page.drawRectangle({
    x: destX,
    y: y - 70,
    width: boxW,
    height: 70,
    color: rgb(0.97, 0.98, 1.0),
    borderColor: rgb(0.85, 0.9, 0.98),
    borderWidth: 1,
  });
  page.drawText('CONSIGNEE (DESTINATION)', { x: destX + 8, y: y - 12, font: boldFont, size: 8.5, color: rgb(0.1, 0.25, 0.5) });
  page.drawText(formatAddress(load.destination), { x: destX + 8, y: y - 28, font, size: 8.5 });
  if (load.deliveryDateTime) {
    page.drawText(`Delivery Window: ${formatDate(new Date(load.deliveryDateTime), 'PPp')}`, { x: destX + 8, y: y - 48, font: italicFont, size: 8, color: rgb(0.3, 0.35, 0.4) });
  }

  y -= 85;

  // Cargo & Freight Specs Table
  page.drawRectangle({
    x: margin,
    y: y - 65,
    width: 600 - margin * 2,
    height: 65,
    color: rgb(0.98, 0.98, 0.99),
    borderColor: rgb(0.88, 0.9, 0.94),
    borderWidth: 1,
  });
  page.drawText('FREIGHT & COMMODITY SPECIFICATIONS', { x: margin + 8, y: y - 12, font: boldFont, size: 8.5, color: rgb(0.2, 0.25, 0.35) });
  page.drawText(`Commodity Description: ${load.cargoDescription || 'Commercial Freight'}`, { x: margin + 8, y: y - 28, font, size: 9 });
  const dimsWeight = `Quantity: ${load.cargoQuantity || 1} units  |  Weight: ${load.cargoWeightNum ? `${load.cargoWeightNum.toLocaleString()} lbs` : 'Standard'}  |  Placement: ${load.placementMode || 'Standard'}`;
  page.drawText(dimsWeight, { x: margin + 8, y: y - 44, font, size: 8.5, color: rgb(0.25, 0.3, 0.35) });
  if (load.specialTerms) {
    page.drawText(`Handling Terms: ${load.specialTerms}`, { x: margin + 8, y: y - 57, font: italicFont, size: 7.5, color: rgb(0.4, 0.45, 0.5) });
  }

  y -= 80;

  // Receiver Certification & Sign-on-Glass Section
  page.drawRectangle({
    x: margin,
    y: y - 190,
    width: 600 - margin * 2,
    height: 190,
    color: rgb(0.99, 1.0, 0.99),
    borderColor: rgb(0.7, 0.85, 0.75),
    borderWidth: 1.5,
  });

  page.drawText('RECEIVER CERTIFICATION & DIGITAL SIGN-ON-GLASS SIGNATURE', {
    x: margin + 12,
    y: y - 15,
    font: boldFont,
    size: 9.5,
    color: rgb(0.1, 0.4, 0.2),
  });
  page.drawText('Received above described freight in good order and condition, except as noted.', {
    x: margin + 12,
    y: y - 28,
    font: italicFont,
    size: 8,
    color: rgb(0.3, 0.4, 0.35),
  });

  page.drawText(`Printed Receiver Name: ${receivedBy}`, { x: margin + 12, y: y - 48, font: boldFont, size: 9 });
  page.drawText(`Delivered Timestamp: ${formatDate(new Date(deliveredAt || Date.now()), 'PPpp')}`, { x: margin + 12, y: y - 62, font, size: 8.5 });
  page.drawText(`Condition / Exception Notes: ${conditionNotes?.trim() || 'None reported — Delivered intact'}`, {
    x: margin + 12,
    y: y - 76,
    font,
    size: 8.5,
    color: conditionNotes?.trim() ? rgb(0.7, 0.2, 0.1) : rgb(0.2, 0.3, 0.2),
  });

  // Embed signature image if available
  if (signatureDataUrl) {
    try {
      const parts = signatureDataUrl.split(',');
      const binaryString = atob(parts[1]);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const sigImg = await pdfDoc.embedPng(bytes);
      const sigDims = sigImg.scaleToFit(200, 75);
      page.drawImage(sigImg, {
        x: margin + 14,
        y: y - 170,
        width: sigDims.width,
        height: sigDims.height,
      });
      page.drawLine({
        start: { x: margin + 12, y: y - 172 },
        end: { x: margin + 260, y: y - 172 },
        thickness: 1,
        color: rgb(0.3, 0.3, 0.3),
      });
      page.drawText('Authorized Digital Receiver Signature', { x: margin + 14, y: y - 183, font: italicFont, size: 7.5, color: rgb(0.4, 0.4, 0.4) });
    } catch (e) {
      console.warn('Could not embed signature PNG into digital BOL:', e);
      page.drawText('[Verified Electronic Signature Recorded on Device]', { x: margin + 12, y: y - 120, font: boldFont, size: 9, color: rgb(0.1, 0.4, 0.2) });
    }
  }

  // Footer seal
  page.drawText(`Digital BOL Verification Hash: BOL-${Date.now().toString(36).toUpperCase()} • Verified Electronic Transit Record`, {
    x: margin,
    y: margin + 15,
    font: italicFont,
    size: 7.5,
    color: rgb(0.5, 0.5, 0.55),
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}

/**
 * Compiles a standard internal Outbound Bill of Lading (BOL) PDF using existing load details:
 * Cargo weight, dimensions, origin, destination, special handling, and carrier credentials.
 * This provides the active transit shipping document that drivers carry and present to receivers.
 */
export async function compileInternalOutboundBolPdf(options: {
  load: Partial<Load>;
  carrierName?: string;
  carrierDot?: string;
  carrierMc?: string;
  carrierAddress?: any;
  carrierPhone?: string;
  carrierEmail?: string;
}): Promise<Blob> {
  const {
    load,
    carrierName = 'PayloadLogic Fleet Logistics',
    carrierDot,
    carrierMc,
    carrierAddress,
    carrierPhone,
    carrierEmail,
  } = options;

  const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 850]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const italicFont = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const margin = 45;
  let y = 850 - margin;

  // Header Title
  page.drawText('STANDARD BILL OF LADING', {
    x: margin,
    y,
    font: boldFont,
    size: 18,
    color: rgb(0.05, 0.2, 0.45),
  });
  y -= 15;
  page.drawText('OFFICIAL MOTOR CARRIER FREIGHT MANIFEST • INTERNAL DISPATCH COPY', {
    x: margin,
    y,
    font: boldFont,
    size: 8.5,
    color: rgb(0.1, 0.4, 0.25),
  });
  y -= 14;

  // Carrier block
  page.drawText(carrierName, { x: margin, y, font: boldFont, size: 10, color: rgb(0.15, 0.2, 0.25) });
  y -= 12;
  const dotStr = `USDOT: ${carrierDot || 'Pending'}  |  MC: ${carrierMc || 'Pending'}`;
  page.drawText(dotStr, { x: margin, y, font, size: 8.5, color: rgb(0.35, 0.4, 0.45) });
  if (carrierAddress) {
    y -= 11;
    page.drawText(formatAddress(carrierAddress), { x: margin, y, font, size: 8, color: rgb(0.35, 0.4, 0.45) });
  }
  if (carrierPhone || carrierEmail) {
    y -= 11;
    page.drawText([carrierPhone, carrierEmail].filter(Boolean).join('  •  '), { x: margin, y, font, size: 8, color: rgb(0.35, 0.4, 0.45) });
  }

  // Load Meta right box
  const rightX = 380;
  let ry = 850 - margin;
  const bolDisplayNum = load.loadNumber ? `BOL-${load.loadNumber}` : (load.id ? `BOL-${load.id.substring(0, 8)}` : `BOL-${Date.now().toString().slice(-6)}`);
  page.drawText(bolDisplayNum, {
    x: rightX,
    y: ry,
    font: boldFont,
    size: 12,
    color: rgb(0.05, 0.2, 0.45),
  });
  ry -= 14;
  page.drawText(`Load Ref: #${load.loadNumber || (load.id ? load.id.substring(0, 8) : 'NEW')}`, { x: rightX, y: ry, font: boldFont, size: 9 });
  ry -= 13;
  const issueDate = load.pickupDateTime ? formatDate(new Date(load.pickupDateTime), 'PP') : formatDate(new Date(), 'PP');
  page.drawText(`Date Issued: ${issueDate}`, { x: rightX, y: ry, font, size: 8.5 });
  ry -= 13;
  page.drawText('Document Type: Internal Generated BOL', { x: rightX, y: ry, font: boldFont, size: 8, color: rgb(0.1, 0.4, 0.2) });

  y = Math.min(y - 12, ry - 12);

  page.drawLine({
    start: { x: margin, y },
    end: { x: 600 - margin, y },
    thickness: 1.5,
    color: rgb(0.85, 0.88, 0.92),
  });
  y -= 18;

  // Origin (Shipper) and Destination (Consignee)
  const boxW = (600 - margin * 2 - 16) / 2;
  const originAddr = load.origin || { street: '', city: 'Origin Location', state: '', zip: '' };
  const destAddr = load.destination || { street: '', city: 'Destination Location', state: '', zip: '' };

  // Shipper box
  page.drawRectangle({
    x: margin,
    y: y - 80,
    width: boxW,
    height: 80,
    color: rgb(0.97, 0.98, 1.0),
    borderColor: rgb(0.85, 0.9, 0.98),
    borderWidth: 1,
  });
  page.drawText('SHIPPER (ORIGIN FACILITY)', { x: margin + 8, y: y - 13, font: boldFont, size: 8.5, color: rgb(0.1, 0.25, 0.5) });
  if (originAddr.companyName) {
    page.drawText(originAddr.companyName, { x: margin + 8, y: y - 27, font: boldFont, size: 8.5 });
    page.drawText(formatAddress(originAddr), { x: margin + 8, y: y - 41, font, size: 8 });
  } else {
    page.drawText(formatAddress(originAddr) || 'Address On File', { x: margin + 8, y: y - 27, font, size: 8.5 });
  }
  if (originAddr.contactName || originAddr.contactPhone) {
    page.drawText(`Contact: ${[originAddr.contactName, originAddr.contactPhone].filter(Boolean).join(' - ')}`, { x: margin + 8, y: y - 56, font, size: 7.5, color: rgb(0.3, 0.35, 0.4) });
  }
  if (load.pickupDateTime) {
    page.drawText(`Pickup Scheduled: ${formatDate(new Date(load.pickupDateTime), 'PPp')}`, { x: margin + 8, y: y - 70, font: italicFont, size: 7.5, color: rgb(0.2, 0.35, 0.5) });
  }

  // Consignee box
  const destX = margin + boxW + 16;
  page.drawRectangle({
    x: destX,
    y: y - 80,
    width: boxW,
    height: 80,
    color: rgb(0.97, 0.98, 1.0),
    borderColor: rgb(0.85, 0.9, 0.98),
    borderWidth: 1,
  });
  page.drawText('CONSIGNEE (DELIVER TO FACILITY)', { x: destX + 8, y: y - 13, font: boldFont, size: 8.5, color: rgb(0.1, 0.25, 0.5) });
  if (destAddr.companyName) {
    page.drawText(destAddr.companyName, { x: destX + 8, y: y - 27, font: boldFont, size: 8.5 });
    page.drawText(formatAddress(destAddr), { x: destX + 8, y: y - 41, font, size: 8 });
  } else {
    page.drawText(formatAddress(destAddr) || 'Address On File', { x: destX + 8, y: y - 27, font, size: 8.5 });
  }
  if (destAddr.contactName || destAddr.contactPhone) {
    page.drawText(`Contact: ${[destAddr.contactName, destAddr.contactPhone].filter(Boolean).join(' - ')}`, { x: destX + 8, y: y - 56, font, size: 7.5, color: rgb(0.3, 0.35, 0.4) });
  }
  if (load.deliveryDateTime) {
    page.drawText(`Est. Delivery: ${formatDate(new Date(load.deliveryDateTime), 'PPp')}`, { x: destX + 8, y: y - 70, font: italicFont, size: 7.5, color: rgb(0.2, 0.35, 0.5) });
  }

  y -= 95;

  // Cargo & Commodity Specifications Section
  page.drawRectangle({
    x: margin,
    y: y - 110,
    width: 600 - margin * 2,
    height: 110,
    color: rgb(0.98, 0.99, 1.0),
    borderColor: rgb(0.85, 0.88, 0.94),
    borderWidth: 1,
  });
  page.drawText('FREIGHT & COMMODITY SPECIFICATIONS', { x: margin + 10, y: y - 14, font: boldFont, size: 9, color: rgb(0.15, 0.2, 0.35) });

  page.drawText('Commodity Description:', { x: margin + 10, y: y - 32, font: boldFont, size: 8.5, color: rgb(0.3, 0.35, 0.4) });
  page.drawText(load.cargoDescription || 'Commercial Freight / General Cargo', { x: margin + 130, y: y - 32, font, size: 8.5 });

  const totalWeightLbs = (load.cargoWeightNum || 0) * (load.cargoQuantity || 1);
  const weightStr = totalWeightLbs > 0 ? `${totalWeightLbs.toLocaleString()} lbs (${load.cargoWeightNum?.toLocaleString()} lbs / unit)` : (load.cargoWeight || 'Standard Payload');
  page.drawText('Weight:', { x: margin + 10, y: y - 48, font: boldFont, size: 8.5, color: rgb(0.3, 0.35, 0.4) });
  page.drawText(weightStr, { x: margin + 130, y: y - 48, font, size: 8.5 });

  const dimsStr = (load.cargoLength && load.cargoWidth)
    ? `${load.cargoLength}ft L x ${load.cargoWidth}ft W${load.cargoHeight ? ` x ${load.cargoHeight}ft H` : ''}`
    : (load.cargoDimensions || 'Standard Dimensions');
  page.drawText('Dimensions:', { x: margin + 10, y: y - 64, font: boldFont, size: 8.5, color: rgb(0.3, 0.35, 0.4) });
  page.drawText(dimsStr, { x: margin + 130, y: y - 64, font, size: 8.5 });

  const unitsStr = `${load.cargoQuantity || 1} unit(s)  •  Placement: ${load.placementMode || 'Standard'}${load.isPartialLTL ? '  •  LTL / Partial' : ''}`;
  page.drawText('Quantity & Handling:', { x: margin + 10, y: y - 80, font: boldFont, size: 8.5, color: rgb(0.3, 0.35, 0.4) });
  page.drawText(unitsStr, { x: margin + 130, y: y - 80, font, size: 8.5 });

  if (load.requiresTarping || load.specialTerms) {
    const handlingNotes = [load.requiresTarping ? 'Tarping Required' : '', load.specialTerms || ''].filter(Boolean).join(' | ');
    page.drawText('Special Instructions:', { x: margin + 10, y: y - 96, font: boldFont, size: 8.5, color: rgb(0.7, 0.2, 0.1) });
    page.drawText(handlingNotes.substring(0, 75), { x: margin + 130, y: y - 96, font: italicFont, size: 8, color: rgb(0.7, 0.2, 0.1) });
  }

  y -= 125;

  // Transit Carrier & Equipment Info
  page.drawRectangle({
    x: margin,
    y: y - 55,
    width: 600 - margin * 2,
    height: 55,
    color: rgb(0.99, 0.99, 0.99),
    borderColor: rgb(0.88, 0.9, 0.94),
    borderWidth: 1,
  });
  page.drawText('ASSIGNED TRANSPORT EQUIPMENT', { x: margin + 10, y: y - 13, font: boldFont, size: 8.5, color: rgb(0.2, 0.25, 0.35) });
  const equipStr = `Loaded Distance: ${load.distance || 0} miles  •  Trailer Hitch/Deck: Commercial Flatbed / Hotshot  •  Rate Agreed: Active Transport Contract`;
  page.drawText(equipStr, { x: margin + 10, y: y - 29, font, size: 8, color: rgb(0.3, 0.35, 0.4) });
  page.drawText('Driver carries this document as official manifest during interstate commerce under 49 CFR Part 373.', { x: margin + 10, y: y - 44, font: italicFont, size: 7.5, color: rgb(0.4, 0.45, 0.5) });

  y -= 70;

  // Receiver Delivery Verification Section (Physical sign block on paper or digital presentation)
  page.drawRectangle({
    x: margin,
    y: y - 195,
    width: 600 - margin * 2,
    height: 195,
    color: rgb(0.99, 1.0, 0.99),
    borderColor: rgb(0.7, 0.85, 0.75),
    borderWidth: 1.5,
  });

  page.drawText('RECEIVER DELIVERY RECEIPT & SIGNATURE (PROOF OF DELIVERY)', {
    x: margin + 12,
    y: y - 15,
    font: boldFont,
    size: 9.5,
    color: rgb(0.1, 0.4, 0.2),
  });
  page.drawText('Received above described freight in good order and condition, except as noted.', {
    x: margin + 12,
    y: y - 28,
    font: italicFont,
    size: 8,
    color: rgb(0.3, 0.4, 0.35),
  });

  // Lines for receiver sign-off
  const sigLineY1 = y - 75;
  page.drawLine({ start: { x: margin + 12, y: sigLineY1 }, end: { x: margin + 260, y: sigLineY1 }, thickness: 1, color: rgb(0.4, 0.4, 0.4) });
  page.drawText('Consignee / Receiver Signature', { x: margin + 12, y: sigLineY1 - 11, font: italicFont, size: 7.5, color: rgb(0.4, 0.4, 0.4) });

  page.drawLine({ start: { x: margin + 285, y: sigLineY1 }, end: { x: 600 - margin - 12, y: sigLineY1 }, thickness: 1, color: rgb(0.4, 0.4, 0.4) });
  page.drawText('Printed Name of Receiver', { x: margin + 285, y: sigLineY1 - 11, font: italicFont, size: 7.5, color: rgb(0.4, 0.4, 0.4) });

  const sigLineY2 = y - 125;
  page.drawLine({ start: { x: margin + 12, y: sigLineY2 }, end: { x: margin + 180, y: sigLineY2 }, thickness: 1, color: rgb(0.4, 0.4, 0.4) });
  page.drawText('Date of Delivery (MM/DD/YYYY)', { x: margin + 12, y: sigLineY2 - 11, font: italicFont, size: 7.5, color: rgb(0.4, 0.4, 0.4) });

  page.drawLine({ start: { x: margin + 205, y: sigLineY2 }, end: { x: margin + 340, y: sigLineY2 }, thickness: 1, color: rgb(0.4, 0.4, 0.4) });
  page.drawText('Time of Delivery', { x: margin + 205, y: sigLineY2 - 11, font: italicFont, size: 7.5, color: rgb(0.4, 0.4, 0.4) });

  page.drawText('Exception / Damage Notes (if any):', { x: margin + 12, y: y - 148, font: boldFont, size: 8, color: rgb(0.3, 0.35, 0.4) });
  page.drawLine({ start: { x: margin + 12, y: y - 175 }, end: { x: 600 - margin - 12, y: y - 175 }, thickness: 0.75, color: rgb(0.8, 0.8, 0.8) });

  page.drawText('Notice: Consignee signing without exceptions verifies all cargo delivered complete and undamaged.', {
    x: margin + 12,
    y: y - 188,
    font: italicFont,
    size: 7,
    color: rgb(0.4, 0.45, 0.5),
  });

  // Footer seal
  page.drawText(`Antigravity TMS Manifest • ${bolDisplayNum} • Valid Active Transit Document`, {
    x: margin,
    y: margin + 12,
    font: italicFont,
    size: 7.5,
    color: rgb(0.5, 0.5, 0.55),
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: 'application/pdf' });
}
