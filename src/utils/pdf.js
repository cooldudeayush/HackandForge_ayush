function drawRadarChart(doc, { x, y, size, candidate, benchmark }) {
  const labels = ['Relevance', 'Depth', 'Clarity', 'Correctness']
  const cx = x
  const cy = y
  const r = size / 2
  const n = labels.length

  const angle = (i) => (i / n) * Math.PI * 2 - Math.PI / 2
  const point = (scale, i) => ({
    x: cx + Math.cos(angle(i)) * r * scale,
    y: cy + Math.sin(angle(i)) * r * scale
  })

  const drawPolygon = (values, color, width = 0.7, dashed = false) => {
    const pts = values.map((v, i) => point(v / 100, i))
    doc.setDrawColor(...color)
    doc.setLineWidth(width)
    doc.setLineDashPattern(dashed ? [1.2, 1] : [], 0)
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i]
      const p2 = pts[(i + 1) % pts.length]
      doc.line(p1.x, p1.y, p2.x, p2.y)
    }
    doc.setLineDashPattern([], 0)
    return pts
  }

  const candidateVals = labels.map((label) => candidate[label.toLowerCase()] || 0)
  const benchmarkVals = labels.map((label) => benchmark[label.toLowerCase()] || 70)

  doc.setDrawColor(220, 224, 232)
  doc.setLineWidth(0.2)
  ;[0.25, 0.5, 0.75, 1].forEach((scale) => {
    const pts = labels.map((_, i) => point(scale, i))
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i]
      const p2 = pts[(i + 1) % pts.length]
      doc.line(p1.x, p1.y, p2.x, p2.y)
    }
  })

  doc.setDrawColor(230, 232, 238)
  labels.forEach((_, i) => {
    const p = point(1, i)
    doc.line(cx, cy, p.x, p.y)
  })

  drawPolygon(benchmarkVals, [120, 138, 230], 0.45, true)
  const candidatePts = drawPolygon(candidateVals, [79, 110, 247], 0.8, false)

  doc.setFillColor(79, 110, 247)
  candidatePts.forEach((p) => {
    doc.circle(p.x, p.y, 1.1, 'F')
  })

  doc.setFontSize(6.5)
  doc.setTextColor(110, 104, 128)
  labels.forEach((label, i) => {
    const dist = r + 8
    const px = cx + Math.cos(angle(i)) * dist
    const py = cy + Math.sin(angle(i)) * dist
    let align = 'center'
    const cos = Math.cos(angle(i))
    if (Math.abs(cos) >= 0.2) align = cos < 0 ? 'right' : 'left'
    doc.text(label, px, py, { align })
  })

  const legendY = cy + r + 14
  doc.setFillColor(79, 110, 247)
  doc.circle(cx - 18, legendY, 1.2, 'F')
  doc.setTextColor(90, 90, 90)
  doc.text('Candidate', cx - 14, legendY + 1, { align: 'left' })
  doc.setDrawColor(120, 138, 230)
  doc.setLineWidth(0.5)
  doc.setLineDashPattern([1.2, 1], 0)
  doc.line(cx + 9, legendY, cx + 15, legendY)
  doc.setLineDashPattern([], 0)
  doc.text('Benchmark', cx + 18, legendY + 1, { align: 'left' })
}

export async function exportReportPDF(session) {
  const { jsPDF } = await import('jspdf')
  const { default: autoTable } = await import('jspdf-autotable')

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const hire = session.overallScore >= (session.threshold || 65)
  const dims = session.dimensions || {}
  const bm = session.benchmark || {}

  doc.setFillColor(hire ? '#10B981' : '#EF4444')
  doc.rect(0, 0, 210, 18, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.text('RecruitAI - Session Evaluation Report', 14, 11)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.text(
    `${hire ? 'RECOMMENDED: HIRE' : 'RECOMMENDED: NO HIRE'} - ${Math.round(session.overallScore)}% overall (threshold: ${session.threshold}%)`,
    14,
    16.5
  )

  doc.setTextColor(30, 30, 30)
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.text(session.candidateName, 14, 30)
  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(90, 90, 90)
  doc.text(
    `${session.role}  -  ${session.difficulty} difficulty  -  ${new Date(session.date).toLocaleDateString()}  -  ${session.candidateEmail}`,
    14,
    37
  )

  let y = 46

  if (session.summary?.executiveSummary) {
    doc.setFillColor(248, 248, 248)
    doc.roundedRect(14, y, 182, 28, 2, 2, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(50, 50, 50)
    doc.text('EXECUTIVE SUMMARY', 18, y + 6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(70, 70, 70)
    const lines = doc.splitTextToSize(session.summary.executiveSummary, 170)
    doc.text(lines.slice(0, 4), 18, y + 12)
    y += 34
  }

  const scoreBoxes = [
    { label: 'Overall Score', value: `${Math.round(session.overallScore)}%` },
    { label: 'Relevance', value: `${dims.relevance || 0}%` },
    { label: 'Depth', value: `${dims.depth || 0}%` },
    { label: 'Clarity', value: `${dims.clarity || 0}%` },
    { label: 'Correctness', value: `${dims.correctness || 0}%` }
  ]

  scoreBoxes.forEach((box, i) => {
    const x = 14 + i * 37.6
    doc.setFillColor(i === 0 ? (hire ? '#D1FAE5' : '#FEE2E2') : '#F0F0F8')
    doc.roundedRect(x, y, 35, 18, 2, 2, 'F')
    doc.setFontSize(14)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(i === 0 ? (hire ? '#065F46' : '#991B1B') : '#3730A3')
    doc.text(box.value, x + 17.5, y + 10, { align: 'center' })
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(box.label, x + 17.5, y + 15, { align: 'center' })
  })
  y += 26

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Skill Radar', 14, y)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(90, 90, 90)
  doc.text('Candidate vs benchmark profile', 14, y + 4)
  drawRadarChart(doc, {
    x: 72,
    y: y + 28,
    size: 52,
    candidate: dims,
    benchmark: bm
  })
  y += 64

  doc.setFontSize(10)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 30)
  doc.text('Benchmark Comparison', 14, y)
  y += 4

  autoTable(doc, {
    startY: y,
    head: [['Dimension', 'Candidate', 'Benchmark', 'Gap', 'Status']],
    body: ['relevance', 'depth', 'clarity', 'correctness'].map((dim) => {
      const c = dims[dim] || 0
      const b = bm[dim] || 70
      const gap = c - b
      return [
        dim.charAt(0).toUpperCase() + dim.slice(1),
        `${c}%`,
        `${b}%`,
        gap >= 0 ? `+${gap}%` : `${gap}%`,
        c >= b ? 'Meets' : 'Below'
      ]
    }),
    theme: 'striped',
    styles: { fontSize: 9, cellPadding: 3 },
    headStyles: { fillColor: [79, 110, 247], textColor: 255 },
    columnStyles: {
      3: { halign: 'center', fontStyle: 'bold' },
      4: { halign: 'center', fontStyle: 'bold' }
    },
    didParseCell(data) {
      if (data.column.index === 3 && data.section === 'body') {
        const val = parseInt(data.cell.raw)
        data.cell.styles.textColor = val >= 0 ? [6, 95, 70] : [153, 27, 27]
      }
      if (data.column.index === 4 && data.section === 'body') {
        data.cell.styles.textColor = data.cell.raw === 'Meets' ? [6, 95, 70] : [153, 27, 27]
      }
    },
    margin: { left: 14, right: 14 }
  })
  y = doc.lastAutoTable.finalY + 8

  if (session.summary?.benchmarkAnalysis) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(80, 80, 80)
    const lines = doc.splitTextToSize(session.summary.benchmarkAnalysis, 182)
    doc.text(lines, 14, y)
    y += lines.length * 4.5 + 6
  }

  if (Object.keys(session.stageScores || {}).length) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text('Stage Performance', 14, y)
    y += 4
    autoTable(doc, {
      startY: y,
      head: [['Stage', 'Score', 'Questions Answered']],
      body: Object.entries(session.stageScores).map(([stage, score]) => [
        stage.charAt(0).toUpperCase() + stage.slice(1),
        `${score}%`,
        `${(session.qaLog || []).filter((q) => q.stage === stage).length} questions`
      ]),
      theme: 'striped',
      styles: { fontSize: 9, cellPadding: 3 },
      headStyles: { fillColor: [79, 110, 247], textColor: 255 },
      margin: { left: 14, right: 14 }
    })
    y = doc.lastAutoTable.finalY + 8
  }

  if (session.summary) {
    if (y > 230) {
      doc.addPage()
      y = 20
    }

    doc.setFillColor(240, 253, 244)
    doc.roundedRect(14, y, 88, 22, 2, 2, 'F')
    doc.setFillColor(254, 242, 242)
    doc.roundedRect(108, y, 88, 22, 2, 2, 'F')
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(6, 95, 70)
    doc.text('STRENGTHS', 18, y + 6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(50, 100, 50)
    const strengthLines = doc.splitTextToSize(session.summary.technicalStrength || '', 80)
    doc.text(strengthLines.slice(0, 2), 18, y + 11)

    doc.setFont('helvetica', 'bold')
    doc.setTextColor(153, 27, 27)
    doc.text('GROWTH AREAS', 112, y + 6)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(150, 50, 50)
    const growthLines = doc.splitTextToSize(session.summary.areasForGrowth || '', 80)
    doc.text(growthLines.slice(0, 2), 112, y + 11)
    y += 30
  }

  if (session.summary?.hiringSuggestion) {
    if (y > 240) {
      doc.addPage()
      y = 20
    }

    doc.setFillColor(hire ? '#ECFDF5' : '#FEF2F2')
    doc.roundedRect(14, y, 182, 18, 2, 2, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(hire ? '#065F46' : '#991B1B')
    doc.text('HIRING RECOMMENDATION', 18, y + 6)
    doc.setFont('helvetica', 'normal')
    const lines = doc.splitTextToSize(session.summary.hiringSuggestion, 170)
    doc.text(lines.slice(0, 2), 18, y + 12)
    y += 26
  }

  if ((session.qaLog || []).length) {
    doc.addPage()
    doc.setFontSize(12)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 30)
    doc.text('Per-Question Evaluation', 14, 20)

    autoTable(doc, {
      startY: 26,
      head: [['#', 'Stage', 'Question', 'Score', 'AI Feedback']],
      body: session.qaLog.map((q, i) => {
        const avg = Math.round(((q.relevance + q.depth + q.clarity + q.correctness) / 4) * 10)
        return [i + 1, q.stage, q.question, `${avg}%`, q.feedback || '-']
      }),
      theme: 'striped',
      styles: { fontSize: 8, cellPadding: 2.5, overflow: 'linebreak' },
      headStyles: { fillColor: [79, 110, 247], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 8, halign: 'center' },
        1: { cellWidth: 20 },
        2: { cellWidth: 68 },
        3: { cellWidth: 14, halign: 'center', fontStyle: 'bold' },
        4: { cellWidth: 62 }
      },
      didParseCell(data) {
        if (data.column.index === 3 && data.section === 'body') {
          const val = parseInt(data.cell.raw)
          data.cell.styles.textColor = val >= 70 ? [6, 95, 70] : val >= 50 ? [146, 64, 14] : [153, 27, 27]
        }
      },
      margin: { left: 14, right: 14 }
    })
  }

  const pageCount = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(160, 160, 160)
    doc.text(
      `RecruitAI Enterprise Platform - Generated ${new Date().toLocaleString()} - Page ${i} of ${pageCount}`,
      14,
      290
    )
  }

  doc.save(`RecruitAI_${session.candidateName.replace(/\s+/g, '_')}_${session.role.split(' ')[0]}_Report.pdf`)
}
