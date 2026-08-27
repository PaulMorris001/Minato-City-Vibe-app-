import PDFDocument from "pdfkit";

/**
 * Render a pass as a printable PDF ticket.
 *
 * The pass email already embeds the QR inline, which is enough to get through a
 * door with a phone in hand. This exists for everything that isn't that: a
 * printed copy, a dead battery, a guest who forwards the ticket to whoever is
 * actually attending, or a venue that wants something to file.
 *
 * A4 rather than a ticket-shaped page so it prints on ordinary paper without
 * anyone touching scale settings.
 *
 * The pass code is printed in full under the QR on purpose — door staff can
 * type it in when a screen is too cracked, too dim, or too scratched to scan.
 *
 * @param {object} opts
 * @param {string} opts.eventTitle
 * @param {string} opts.eventDateText   human-readable date/time
 * @param {string} opts.eventLocation
 * @param {string} opts.username        who the pass belongs to
 * @param {string} opts.code            the pass code encoded in the QR
 * @param {Buffer} opts.qrBuffer        PNG of the pass QR
 * @param {"rsvp"|"ticket"} opts.type
 * @param {string} opts.supportEmail
 * @returns {Promise<Buffer>}
 */
export function buildPassPdf({
  eventTitle,
  eventDateText,
  eventLocation,
  username,
  code,
  qrBuffer,
  type,
  supportEmail,
}) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 0 });
      const chunks = [];
      doc.on("data", (c) => chunks.push(c));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const PAGE_W = doc.page.width;
      const M = 56;
      const W = PAGE_W - M * 2;

      // Header band — same purple as the email templates.
      doc
        .rect(0, 0, PAGE_W, 96)
        .fill(
          doc.linearGradient(0, 0, PAGE_W, 96).stop(0, "#a855f7").stop(1, "#7c3aed")
        );
      doc
        .font("Helvetica-Bold")
        .fontSize(22)
        .fillColor("#ffffff")
        .text("OurCityvibe", 0, 38, { width: PAGE_W, align: "center" });

      let y = 140;

      // Type badge
      const badge = type === "ticket" ? "EVENT TICKET" : "RSVP PASS";
      doc.font("Helvetica-Bold").fontSize(9);
      const badgeW = doc.widthOfString(badge) + 24;
      doc.roundedRect(M, y, badgeW, 22, 11).fill("#7c3aed");
      doc
        .fillColor("#ffffff")
        .text(badge, M, y + 7, { width: badgeW, align: "center", characterSpacing: 1 });
      y += 44;

      // Event title
      doc.font("Helvetica-Bold").fontSize(24).fillColor("#1f2937");
      doc.text(eventTitle || "Your event", M, y, { width: W });
      y = doc.y + 16;

      // Details
      const row = (label, value) => {
        if (!value) return;
        doc.font("Helvetica").fontSize(9).fillColor("#6b7280");
        doc.text(label.toUpperCase(), M, y, { width: W, characterSpacing: 1 });
        doc.font("Helvetica-Bold").fontSize(13).fillColor("#1f2937");
        doc.text(value, M, doc.y + 2, { width: W });
        y = doc.y + 14;
      };
      row("When", eventDateText);
      row("Where", eventLocation);
      row("Pass holder", username);

      // Divider
      y += 6;
      doc.moveTo(M, y).lineTo(M + W, y).lineWidth(1).stroke("#e5e7eb");
      y += 30;

      // QR — the part that actually gets scanned.
      const QR = 220;
      if (qrBuffer) {
        doc.image(qrBuffer, (PAGE_W - QR) / 2, y, { fit: [QR, QR] });
        y += QR + 20;
      }

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#6b7280")
        .text("Show this code at the door", 0, y, { width: PAGE_W, align: "center" });
      y = doc.y + 10;

      doc
        .font("Courier-Bold")
        .fontSize(13)
        .fillColor("#1f2937")
        .text(code || "", 0, y, { width: PAGE_W, align: "center", characterSpacing: 1 });
      y = doc.y + 34;

      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#9ca3af")
        .text(
          `This pass admits one. Questions? ${supportEmail}`,
          0,
          y,
          { width: PAGE_W, align: "center" }
        );

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
