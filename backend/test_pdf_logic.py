from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
import io
from datetime import datetime

def test_pdf():
    data = [{"month": "2024-01", "income": 1000, "expense": 500, "balance": 500}]
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = []
    elements.append(Paragraph("TEST", styles['Title']))
    
    table_data = [["Mois", "Entrées", "Sorties", "Solde"]]
    for m in data:
        table_data.append([m['month'], str(m['income']), str(m['expense']), str(m['balance'])])
    
    t = Table(table_data)
    t.setStyle(TableStyle([('GRID', (0,0), (-1,-1), 1, colors.black)]))
    elements.append(t)
    
    doc.build(elements)
    print("PDF build successful")

if __name__ == "__main__":
    test_pdf()
