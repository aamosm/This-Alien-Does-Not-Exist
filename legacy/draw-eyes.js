    export function drawEyes(ctx, eyeGenome, positions, skinColorRGB, eyeColorRGB) {
        if (eyeGenome.eyeCount === 0 || !positions) return;
        const [sR, sG, sB] = skinColorRGB;
        const [eR, eG, eB] = eyeColorRGB;

        for (const eye of positions) {
            const { x, y, radius } = eye;

            if (eyeGenome.socketDepth > 0.05) {
                ctx.save();
                ctx.globalAlpha = eyeGenome.socketDepth * 0.7;
                ctx.fillStyle = "rgb(0,0,0)";
                ctx.beginPath();
                ctx.ellipse(x, y + radius * 0.15, radius * 1.35, radius * 1.25, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            ctx.save();
            ctx.beginPath();
            const topCtrlY = y - radius * (2 - eyeGenome.eyelidTop * 4);
            const botCtrlY = y + radius * (2 - eyeGenome.eyelidBottom * 4);
            ctx.moveTo(x - radius, y);
            ctx.quadraticCurveTo(x, topCtrlY, x + radius, y);
            ctx.quadraticCurveTo(x, botCtrlY, x - radius, y);
            ctx.clip();

            const irisR = eyeGenome.scleraVisible ? radius * eyeGenome.irisRadius : radius * 0.98;
            ctx.fillStyle = eyeGenome.scleraVisible 
                ? `rgb(${Math.min(255, sR + 70)}, ${Math.min(255, sG + 65)}, ${Math.min(255, sB + 60)})`
                : `rgb(${eR | 0}, ${eG | 0}, ${eB | 0})`;
            ctx.fillRect(x - radius, y - radius, radius*2, radius*2);

            if (eyeGenome.scleraVisible) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(x, y, irisR, 0, Math.PI * 2);
                ctx.clip();
                ctx.fillStyle = `rgb(${eR | 0}, ${eG | 0}, ${eB | 0})`;
                ctx.fillRect(x - irisR, y - irisR, irisR * 2, irisR * 2);

                const streakCount = Math.round(2 + eyeGenome.irisPattern * 10);
                ctx.globalAlpha = 0.25 + eyeGenome.irisPattern * 0.35;
                ctx.strokeStyle = `rgb(${Math.max(0, eR - 60)}, ${Math.max(0, eG - 60)}, ${Math.max(0, eB - 60)})`;
                ctx.lineWidth = Math.max(0.6, irisR * 0.12);
                for (let s = 0; s < streakCount; s++) {
                    const a = (s / streakCount) * Math.PI * 2;
                    ctx.beginPath();
                    ctx.moveTo(x, y);
                    ctx.lineTo(x + Math.cos(a) * irisR, y + Math.sin(a) * irisR);
                    ctx.stroke();
                }
                ctx.restore();
            }

            const pupilR = irisR * eyeGenome.pupilRadius;
            ctx.fillStyle = "rgb(8,8,10)";
            ctx.beginPath();
            if (eyeGenome.pupilType === "slit") {
                ctx.ellipse(x, y, pupilR * 0.2, pupilR, 0, 0, Math.PI * 2);
            } else if (eyeGenome.pupilType === "horizontal") {
                ctx.ellipse(x, y, pupilR, pupilR * 0.3, 0, 0, Math.PI * 2);
            } else {
                ctx.arc(x, y, pupilR, 0, Math.PI * 2);
            }
            ctx.fill();

            const shadowGrad = ctx.createLinearGradient(x - radius, y - radius, x + radius, y + radius);
            shadowGrad.addColorStop(0, "rgba(255,255,255,0.4)"); 
            shadowGrad.addColorStop(0.4, "rgba(0,0,0,0)");
            shadowGrad.addColorStop(1, "rgba(0,0,0,0.85)"); 
            ctx.fillStyle = shadowGrad;
            ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);

            ctx.globalAlpha = eyeGenome.highlightStrength;
            ctx.fillStyle = "rgb(255,255,255)";
            ctx.beginPath();
            ctx.arc(x - pupilR * 0.4, y - pupilR * 0.4, Math.max(0.8, pupilR * 0.3), 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
            ctx.strokeStyle = `rgb(${Math.max(0, sR - 30)}, ${Math.max(0, sG - 30)}, ${Math.max(0, sB - 30)})`;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(x - radius, y);
            ctx.quadraticCurveTo(x, topCtrlY, x + radius, y);
            ctx.quadraticCurveTo(x, botCtrlY, x - radius, y);
            ctx.stroke();
        }
    }

