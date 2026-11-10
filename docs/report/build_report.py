"""Editable source for the submission report, including retained original pages.
Run with bundled Python (reportlab, pymupdf) or equivalent installed packages.
"""
from pathlib import Path
import argparse, math, re, io, json
from xml.sax.saxutils import escape
import pymupdf as fitz
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.enums import TA_CENTER

ROOT = Path(__file__).resolve().parents[2]
W,H=595.276,841.89
M=54; CW=W-2*M
BLUE='#000000'; INK='#000000'; GRAY='#333333'; PALE='#F5F5F5'; GREEN='#F5F5F5'; AMBER='#EEEEEE'; RED='#E5E5E5'
STYLE=ParagraphStyle('body',fontName='Times-Roman',fontSize=11.3,leading=15.4,textColor=HexColor(INK),spaceAfter=8)
SMALL=ParagraphStyle('small',parent=STYLE,fontSize=9.5,leading=12.5)
CAP=ParagraphStyle('caption',parent=STYLE,fontName='Times-Italic',fontSize=10,leading=13,alignment=TA_CENTER,textColor=HexColor(GRAY))
DIAG=ParagraphStyle('diagram',fontName='Helvetica',fontSize=9.2,leading=11.5,alignment=TA_CENTER,textColor=HexColor(INK))
HEAD=ParagraphStyle('head',fontName='Helvetica-Bold',fontSize=15,leading=19,textColor=HexColor(BLUE))
SUB=ParagraphStyle('sub',parent=HEAD,fontSize=12,leading=16)
C=None; PAGE=0; Y=0; bounds=[]

def text(s, x=M, y=None, width=CW, style=STYLE):
    global Y
    y=Y if y is None else y
    p=Paragraph(s,style); _,hh=p.wrap(width,H)
    assert y+hh < H-42, (PAGE,'overflow',s[:80],y,hh)
    p.drawOn(C,x,H-y-hh);bounds.append((PAGE,x,y,width,hh));Y=y+hh+8
    return hh

def title(s):
    global Y
    text(s,style=HEAD);Y+=5

def sub(s): text(s,style=SUB)
def para(s): text(s)
def bullet(s): text('&#8226; '+s)
def note(s):
    global Y
    p=Paragraph(s,SMALL);_,hh=p.wrap(CW-20,H)
    C.setFillColor(HexColor(PALE));C.roundRect(M,H-Y-hh-18,CW,hh+18,4,fill=1,stroke=0)
    text(s,x=M+10,y=Y+9,width=CW-20,style=SMALL);Y+=12

def table(headers,rows,widths=None,fs=9.7):
    global Y
    widths=widths or [CW/len(headers)]*len(headers)
    st=ParagraphStyle('cell',parent=STYLE,fontSize=fs,leading=fs+3)
    hs=ParagraphStyle('th',parent=st,fontName='Helvetica-Bold',textColor=white)
    data=[[Paragraph(v,hs) for v in headers]]+[[Paragraph(str(v),st) for v in row] for row in rows]
    t=Table(data,colWidths=widths,hAlign='LEFT');t.setStyle(TableStyle([
       ('BACKGROUND',(0,0),(-1,0),HexColor(BLUE)),('VALIGN',(0,0),(-1,-1),'TOP'),
       ('ROWBACKGROUNDS',(0,1),(-1,-1),[white,HexColor('#F4F7FA')]),
       ('GRID',(0,0),(-1,-1),.35,HexColor('#C9D5DF')),('LEFTPADDING',(0,0),(-1,-1),7),
       ('RIGHTPADDING',(0,0),(-1,-1),7),('TOPPADDING',(0,0),(-1,-1),6),('BOTTOMPADDING',(0,0),(-1,-1),6)]))
    _,hh=t.wrap(CW,H);assert Y+hh<H-42,(PAGE,'table overflow',Y,hh)
    t.drawOn(C,M,H-Y-hh);bounds.append((PAGE,M,Y,CW,hh));Y+=hh+13

def box(x,y,w,h,s,fill=PALE,ellipse=False,fs=9.2):
    C.setStrokeColor(HexColor('#7993A7'));C.setLineWidth(.65);C.setFillColor(HexColor(fill))
    if ellipse:C.ellipse(x,H-y-h,x+w,H-y,fill=1,stroke=1)
    else:C.roundRect(x,H-y-h,w,h,4,fill=1,stroke=1)
    p=Paragraph(s,ParagraphStyle('d',parent=DIAG,fontSize=fs,leading=fs+2.2));_,hh=p.wrap(w-12,h)
    assert hh<=h-7,(PAGE,'box overflow',s,w,h,hh)
    p.drawOn(C,x+6,H-y-(h+hh)/2);bounds.append((PAGE,x,y,w,h))

def edge(points,label=None,dashed=False,color=GRAY,label_xy=None,open_head=False):
    C.setStrokeColor(HexColor(color));C.setFillColor(HexColor(color));C.setLineWidth(.7)
    C.setDash(3,2) if dashed else C.setDash()
    p=C.beginPath();p.moveTo(points[0][0],H-points[0][1])
    for x,y in points[1:]:p.lineTo(x,H-y)
    C.drawPath(p);C.setDash()
    a,b=points[-2],points[-1];ang=math.atan2(b[1]-a[1],b[0]-a[0]);sz=5
    q1=(b[0]-sz*math.cos(ang-.45),b[1]-sz*math.sin(ang-.45));q2=(b[0]-sz*math.cos(ang+.45),b[1]-sz*math.sin(ang+.45))
    p=C.beginPath();p.moveTo(q1[0],H-q1[1]);p.lineTo(b[0],H-b[1]);p.lineTo(q2[0],H-q2[1]);C.drawPath(p,fill=0)
    if label:
        label = f'«{label}»' if label in ('include','extend') else label
        x,y=label_xy or ((a[0]+b[0])/2,(a[1]+b[1])/2-5)
        C.setFont('Helvetica',8);tw=C.stringWidth(label,'Helvetica',8);C.setFillColor(white);C.rect(x-tw/2-3,H-y-3,tw+6,11,fill=1,stroke=0);C.setFillColor(HexColor(INK));C.drawCentredString(x,H-y,label)

def actor(x,y,label):
    C.setStrokeColor(HexColor(GRAY));C.setLineWidth(.8);C.circle(x,H-y-6,5,fill=0);C.line(x,H-y-11,x,H-y-28);C.line(x-9,H-y-17,x+9,H-y-17);C.line(x,H-y-28,x-8,H-y-39);C.line(x,H-y-28,x+8,H-y-39)
    p=Paragraph(label,ParagraphStyle('a',parent=DIAG,fontSize=8.5,leading=10));_,hh=p.wrap(72,50);p.drawOn(C,x-36,H-y-43-hh)

def caption(n,s,y):
    global Y
    Y=y;text(f'Figure {n}: {s}',style=CAP)

def start(n,heading=None):
    global PAGE,Y
    PAGE=n;Y=61
    C.bookmarkPage(f'p{n}')
    if n>1:
        C.setFillColor(HexColor(GRAY));C.setFont('Helvetica',8);C.drawString(M, H-31,'SWIFTDROP | DESIGN DOCUMENTATION');C.drawRightString(W-M,30,f'Page {n}')
    if heading:title(heading)

def end(): C.showPage()
def diamond(x,y,w,h,s):
    C.setStrokeColor(HexColor('#B38C47'));C.setFillColor(HexColor(AMBER));p=C.beginPath();p.moveTo(x+w/2,H-y);p.lineTo(x+w,H-y-h/2);p.lineTo(x+w/2,H-y-h);p.lineTo(x,H-y-h/2);p.close();C.drawPath(p,fill=1)
    p=Paragraph(s,ParagraphStyle('diamond',parent=DIAG,fontSize=8.7,leading=10));_,hh=p.wrap(w*.67,h);assert hh<h-7;(p.drawOn(C,x+w*.165,H-y-(h+hh)/2))

def sequence(n,labels,steps,top=124,row=30):
    xs=[M+35+i*(CW-70)/(len(labels)-1) for i in range(len(labels))]
    seq_style=ParagraphStyle('seq',parent=SMALL,fontSize=8.8,leading=10.8,alignment=TA_CENTER)
    prepared=[]
    for idx,(a,b,msg,kind) in enumerate(steps,1):
        ww=max(abs(xs[b]-xs[a])-6,110)
        pp=Paragraph(f'{idx}. {escape(msg)}',seq_style);_,hh=pp.wrap(ww,H)
        prepared.append((a,b,kind,pp,ww,hh,max(row,hh+17)))
    bottom=top+69+sum(v[-1] for v in prepared)+5
    for i,lab in enumerate(labels):
        bw=(CW-12*(len(labels)-1))/len(labels)
        box(xs[i]-bw/2,top,bw,42,lab,fs=8.5)
        C.setDash(2,2);C.setStrokeColor(HexColor('#B7C6D2'));C.line(xs[i],H-top-42,xs[i],H-bottom);C.setDash()
    y=top+64
    for a,b,kind,pp,ww,hh,advance in prepared:
        mid=(xs[a]+xs[b])/2
        pp.drawOn(C,mid-ww/2,H-y-hh)
        bounds.append((PAGE,mid-ww/2,y,ww,hh))
        edge([(xs[a],y+hh+4),(xs[b],y+hh+4)],dashed=kind in ('reply','async'),color='#B45145' if kind=='async' else GRAY)
        y+=advance
    return bottom+12

# Content and diagrams below are the maintained source for revised pages.
def build_pages():
    global Y
    start(1)
    Y=145;text('SWIFTDROP',style=ParagraphStyle('cover',parent=HEAD,fontSize=34,leading=42));text('Parcel Delivery &amp; Courier<br/>Management System',style=ParagraphStyle('cover2',parent=HEAD,fontSize=23,leading=30));Y+=16
    para('Design Documentation: Use Cases, Data Model, Architecture,<br/>Integration Design, Key Flows and Justifications');Y+=18
    table(['Item','Details'],[['Module','Enterprise Application Development (Group Assignment, 20 marks)'],['Group number','23'],['Team size','10 members'],['Submission','Design documentation report'],['Date','31 October 2026']], [110,CW-110],11)
    sub('Project repository')
    para('<link href="https://github.com/umairhassaninfinite-ui/swiftdrop" color="#000000">https://github.com/umairhassaninfinite-ui/swiftdrop</link>');end()

    toc=[('Contents',2),('List of Figures',4),('1 Introduction',5),('1.1 Background',5),('1.2 Purpose of this document',5),('1.3 Scope',5),('1.4 Assumptions and constraints',5),('1.5 Technology choices',6),('2 Users, Roles and Access Rules',7),('3 Use Case Modelling',8),('3.1 Customer and recipient',8),('3.2 Merchant',9),('3.3 Courier',10),('3.4 Dispatcher and admin',11),('3.5 Use case specifications',12),('4 Data Design',13),('4.1 Entity overview',14),('4.2 Design decisions',15),('5 System Architecture',16),('5.1 Options we considered',16),('5.2 The chosen architecture',17),('5.3 Inside the Core API',18),('5.4 Why there is no separate BFF',18),('5.5 Deployment view',19),('6 Integration Design',20),('6.1 Integration patterns used',20),('6.2 Event flow',21),('6.3 Event contract',22),('6.4 Queues and routing keys',22),('6.5 Reliability guarantees',23),('6.6 Real-time tracking',23),('7 Key Flows',24),('7.1 Creating a delivery',24),('7.2 Merchant creates an order through the API',25),('7.3 Courier status update triggering notifications',26),('7.4 OAuth 2.0 login with Google',27),('7.5 Parcel lifecycle',28),('7.6 Dispatcher assigns a parcel',29),('7.7 Webhook delivery and retry',30),('8 Design Patterns and Principles',31),('8.1 Patterns applied',31),('8.2 Principles',32),('9 Security Design',33),('9.1 Authentication',33),('9.2 Authorisation',33),('9.3 Merchant API and webhooks',33),('9.4 Personal data',34),('9.5 Secrets and configuration',34),('9.6 Threats and mitigations',34),('10 API Design',35),('10.1 Conventions',35),('10.2 Main endpoints',35),('10.3 Error format',36),('11 Testing Approach',37),('12 Bonus Features',38),('12.1 Kubernetes deployment',38),('12.2 AI delivery assistant',38),('13 Conclusion',39),('Appendix A: Contribution Sheet',40)]
    for n,entries in [(2,toc[:30]),(3,toc[30:])]:
        start(n,'Contents' if n==2 else 'Contents (continued)')
        for label,pn in entries:
            yy=Y;C.setFillColor(HexColor(INK));C.setFont('Times-Roman',11);C.drawString(M, H-yy,label);C.drawRightString(W-M,H-yy,str(pn));C.linkRect('',f'p{pn}',(M,H-yy-3,W-M,H-yy+10),relative=0);Y+=21
        end()
    figs=[('Customer and recipient use cases',8),('Merchant use cases',9),('Courier use cases',10),('Dispatcher and admin use cases',11),('Conceptual entity-relationship diagram',13),('Layered view of the SwiftDrop architecture',17),('Container deployment view (baseline and optional)',19),('Event-driven integration through RabbitMQ',21),('Sequence: customer creates a delivery',24),('Sequence: merchant API order and webhook',25),('Sequence: courier status update and fan-out',26),('Sequence: Google sign-in with authorization code and PKCE',27),('State diagram: parcel lifecycle',28),('Activity diagram: assignment and reassignment',29),('Activity diagram: webhook delivery with retry',30),('Optional AI assistant through authenticated API tools',38)]
    start(4,'List of Figures')
    for i,(lab,pn) in enumerate(figs,1):
        yy=Y;text(f'<b>Figure {i}:</b> {lab}',width=CW-35,style=SMALL);C.setFont('Times-Roman',10);C.drawRightString(W-M,H-yy-10,str(pn));Y+=8
    end()

    start(5,'1 Introduction');sub('1.1 Background')
    para('SwiftDrop is a courier company delivering parcels across Sri Lanka. Bookings have come in over the phone and been tracked in shared spreadsheets. Customers call the hotline for updates, dispatchers juggle courier assignments from memory, and merchant order lists are retyped by staff, causing delays and address or phone errors.')
    para('The proposed platform lets customers book and track parcels, merchants submit orders directly from their e-stores, dispatchers see unassigned parcels and courier workloads, and couriers update progress from their phones.')
    sub('1.2 Purpose of this document')
    para('This report records the system design and the reasons behind it: use cases, data model, architecture, integration contracts, key sequences and decision flows, security and testing. It provides a common reference for system development, integration and evaluation.')
    sub('1.3 Scope')
    para('Baseline: customer, merchant, courier, dispatcher and admin functions; JWT authentication with Google sign-in; a scoped merchant API; event-driven email, mock SMS and signed webhooks; live tracking; and local Docker Compose deployment. Kubernetes/Helm and the AI assistant are optional stretch features, started only after the baseline is demoable.')
    para('Out of scope: online card payments, route optimisation, warehouse/hub inventory, native mobile apps and tracking the physical return-to-sender journey. Fees are recorded and settled offline. The courier UI is a mobile-first PWA.')
    sub('1.4 Assumptions and constraints')
    bullet('Prices use integer Sri Lankan Rupee cents. Origin zone, destination zone, size and weight determine the fee. Zones follow district groupings.')
    bullet('Couriers use mid-range Android phones on patchy mobile data. Offline updates need conflict handling; local queueing alone cannot guarantee acceptance.')
    bullet('The team has roughly one semester and favours familiar TypeScript tooling. Docker Compose provides the baseline local deployment environment.');end()

    start(6,'1.5 Technology choices')
    para('The TypeScript stack supports a shared development language across the frontend, Core API and workers. Dependency versions and container image digests are pinned together for reproducible deployment.')
    table(['Concern','Choice','Why it fits'],[
    ['Frontend','React 18, Vite, TypeScript, Tailwind CSS','Shared components for five account roles and a public tracking page.'],
    ['Backend','Node.js 24 LTS, Express, TypeScript','Supported runtime line and a familiar HTTP/OAuth/AMQP ecosystem.'],
    ['Validation','Shared Zod schemas','Consistent browser and API rules; the API remains the trust boundary.'],
    ['Database','PostgreSQL 16, Prisma','Relational constraints and atomic parcel/history/outbox transactions.'],
    ['Broker','RabbitMQ topic exchange; supported release to be pinned','Broker-assisted delays and fan-out. Application code still implements retry policy, bookkeeping and safe transfers.'],
    ['Real-time','Socket.IO, Redis adapter','Fallback to long-polling and cross-replica room delivery.'],
    ['Object storage','MinIO, private S3-compatible buckets','Proof photos and receipts outside the database; authorised signed URLs.'],
    ['Authentication','RS256 JWT, Google OIDC, OAuth client credentials','User access, social sign-in and scoped machine access.'],
    ['Testing','Jest, Supertest, Testcontainers; Vitest and React Testing Library','Planned checks against real database/broker dependencies and UI component tests.'],
    ['Deployment','Docker Compose baseline; Kubernetes/Helm optional','Reproducible local environment; reuse images if stretch work proceeds.']
    ],[75,157,CW-232])
    end()

    start(7,'2 Users, Roles and Access Rules')
    para('Five authenticated account roles are Customer, Merchant, Courier, Dispatcher and Admin. Each account has one role. The guest Recipient has no account. A merchant e-store is a separate machine actor using scoped client credentials, not a sixth human role. Admin inherits dispatcher operations and additionally controls configuration and replay.')
    table(['Actor','Goals and authentication'],[['Customer','Book, track, cancel before pickup, download receipt; email/password or Google.'],['Recipient (guest)','Public tracking of one parcel by tracking number; no login.'],['Merchant staff / e-store','Staff dashboard via user JWT; approved e-store via scoped machine JWT.'],['Courier','Assigned jobs, pickup, status and proof; admin-provisioned password account.'],['Dispatcher','Operational parcel creation/status, assignment, workload and reports; password account.'],['Admin','Dispatcher operations plus users, merchant approval, zones, pricing and webhook replay.']], [115,CW-115],9.6)
    text('Table 3: Role-based access matrix',style=CAP)
    table(['Capability','Customer','Merchant','Courier','Dispatcher','Admin'],[
    ['Create parcel','own','own API','-','yes','yes'],['View parcel/history','own','own','assigned','all','all'],['Update status','-','-','assigned','yes','yes'],['Assign / reassign','-','-','-','yes','yes'],['Cancel before pickup','own','own','-','yes','yes'],['View reports','-','own orders','-','yes','yes'],['Manage API/webhook','-','own','-','-','yes'],['Approve merchants; users/zones/pricing','-','-','-','-','yes'],['Replay failed webhook','-','-','-','-','yes']], [130,65,65,65,81,CW-406],8.5)
    para('Every protected request checks role/scope and record ownership in the database query. Ownership-scoped misses return 404; known route-level role/scope denials return 403. Public responses contain only status, time and town.');end()
    start(8,'3 Use Case Modelling')
    para('Use case diagrams show user goals inside the SwiftDrop boundary and external actors outside it. Dashed include arrows point to required behavior; dashed extend arrows point from an optional extension to its base goal. Internal brokers and workers belong in architecture diagrams.')
    sub('3.1 Customer and recipient')
    C.setStrokeColor(HexColor('#9AACBA'));C.rect(123,H-537,350,323,fill=0,stroke=1)
    text('SwiftDrop Platform: Customer and Recipient',x=132,y=220,width=326,style=SMALL)
    actor(84,325,'Customer');actor(84,468,'Recipient<br/>(guest)');actor(514,265,'Google OIDC')
    goals=[('Register account',260),('Log in',307),('Create delivery request',354),('View own tracking/history',401),('Download receipt',448),('Cancel before pickup',495)]
    for lab,yy in goals:
        box(145,yy,172,33,lab,ellipse=True);edge([(92,351),(130,351),(145,yy+16)],open_head=True)
    box(338,260,116,40,'Google sign-in<br/>[Google selected]',GREEN,True,8.6);edge([(454,280),(506,280)]);edge([(338,280),(329,280),(329,323),(317,323)],'extend',True,label_xy=(366,321))
    box(338,354,116,40,'View fee quote',GREEN,True);edge([(317,371),(338,374)],'include',True,label_xy=(329,346))
    box(338,445,116,42,'Public tracking<br/>and live status',GREEN,True);edge([(93,491),(115,491),(115,550),(396,550),(396,487)])
    caption(1,'Customer and recipient use cases',563)
    para('Booking includes viewing a fee quote before confirmation. Google sign-in is an alternative login flow, shown as an extension only when the customer selects Google. Public tracking needs no account and exposes status, time and town only. Cancellation belongs to the owner and is allowed only before pickup.')
    para('Booking confirmation and status alerts follow committed business events. Receipt downloads and tracking-page visits do not send notification events. Email and mock SMS providers are external integrations; the Notification Service itself is internal.');end()

    start(9);end()  # Original merchant diagram and prose retained without changes.

    start(10,'3.3 Courier')
    C.setStrokeColor(HexColor('#9AACBA'));C.rect(130,H-497,370,382,fill=0,stroke=1)
    text('SwiftDrop Platform: Courier',x=141,y=122,width=340,style=SMALL);actor(84,275,'Courier')
    for yy,lab in [(161,'Log in'),(209,"View today's deliveries"),(257,'View parcel details'),(305,'Confirm pickup'),(353,'Update parcel status'),(401,'Mark delivered'),(449,'Mark delivery failed')]:
        box(151,yy,166,34,lab,ellipse=True);edge([(92,300),(119,300),(151,yy+17)])
    box(347,248,135,52,'Navigate to address<br/>[directions requested]',GREEN,True,8.8)
    edge([(347,274),(317,274)],'extend',True,label_xy=(332,260))
    box(347,390,135,55,'Capture recipient name<br/>Photo optional',GREEN,True,8.8);edge([(317,418),(347,418)],'include',True,label_xy=(333,403))
    box(347,454,135,34,'Select failure reason',GREEN,True,8.6);edge([(317,466),(347,471)],'include',True,label_xy=(332,453))
    caption(3,'Courier use cases',516)
    para('Couriers operate only on parcels currently assigned to them. Navigation extends parcel details when directions are requested; its arrow points toward the base use case. Internal event publication is shown in the integration and status sequence diagrams.')
    para('Delivered requires the recipient name. A photo is optional and is stored as a private object. Failed requires a reason from a fixed list, for example recipient unavailable or address not found. The API validates the transition, current assignment, parcel version and proof before committing.')
    note('Offline replay retains the operation key and expected version. A stale, reassigned or invalid update is held for user review; the PWA must never silently overwrite newer server state. See Section 7.3.');end()

    start(11,'3.4 Dispatcher and admin')
    C.setStrokeColor(HexColor('#9AACBA'));C.rect(135,H-566,365,448,fill=0,stroke=1)
    text('SwiftDrop Platform: Operations',x=145,y=125,width=343,style=SMALL);actor(83,217,'Dispatcher');actor(83,418,'Admin')
    # Hollow generalisation triangle: Admin inherits Dispatcher operations.
    C.setStrokeColor(HexColor(GRAY));C.line(83,H-416,83,H-286)
    p=C.beginPath();p.moveTo(77,H-298);p.lineTo(83,H-286);p.lineTo(89,H-298);p.close();C.setFillColor(white);C.drawPath(p,fill=1)
    for yy,lab in [(164,'View queue and workload'),(214,'Assign / reassign courier'),(264,'Create / update parcel'),(314,'Cancel before pickup'),(364,'View delivery reports')]:
        box(154,yy,178,34,lab,ellipse=True);edge([(92,244),(122,244),(154,yy+17)])
    box(350,210,132,44,'Check capacity<br/>under transaction lock',GREEN,True,8.4);edge([(332,231),(350,232)],'include',True,label_xy=(341,202))
    box(350,357,132,44,'Export report CSV<br/>[export requested]',GREEN,True,8.5);edge([(350,379),(332,381)],'extend',True,label_xy=(341,350))
    for yy,lab in [(421,'Manage users, zones, pricing'),(467,'Approve / reject merchants'),(513,'Replay failed webhook')]:
        box(154,yy,178,32,lab,ellipse=True,fs=8.5);edge([(92,445),(122,445),(154,yy+16)])
    caption(4,'Dispatcher and admin use cases (Admin inherits Dispatcher)',580)
    para('Assignment includes the capacity check. Reassignment is the same operational goal with an existing courier, so it uses a branch in the assignment flow rather than a separate permission. The transaction releases old capacity and reserves new capacity together.')
    para('Admins inherit all dispatcher operations, including parcel creation, status updates and assignment. Only Admin may replay failed webhooks or change configuration. Dispatchers may inspect operational failures but do not receive replay permission.');end()

    start(12,'3.5 Use case specifications')
    text('Table 4: Create delivery request',style=CAP)
    table(['Field','UC-C03 Create delivery request'],[
    ['Primary actor','Customer (staff may create operational parcels under the same validation rules).'],
    ['Preconditions','Authenticated active account. Email verification is not a baseline booking precondition.'],
    ['Main flow','1. Enter pickup/drop-off addresses, recipient name/phone, size and weight.<br/>2. Validate input and resolve both zones.<br/>3. Persist an owner-bound quote valid for 15 minutes; display the fee.<br/>4. Confirm quoteId with an Idempotency-Key.<br/>5. Atomically create parcel, first history row, saved idempotency response and outbox event; commit.<br/>6. Return tracking number. The relay later publishes parcel.created; the notification worker sends the confirmation email.'],
    ['Alternatives','Unserved zone: validation error. Expired quote: recalculate and request confirmation. Same key/body: return the saved response; same key/different body: 409. Database failure: roll back. Broker outage: committed outbox waits for retry.'],
    ['Postconditions','Parcel is CREATED, has no courier and appears in the unassigned queue; event delivery is at least once.']], [88,CW-88],9.6)
    text('Table 5: Update parcel status',style=CAP)
    table(['Field','UC-K05 Courier update'],[
    ['Preconditions','Active Courier account; parcel currently assigned to the caller.'],
    ['Main flow','1. Send status, expectedVersion and stable operation key.<br/>2. DELIVERED: recipient name required, photo optional; FAILED: fixed-list reason required.<br/>3. Check ownership, legal transition, version and private proof object.<br/>4. Commit parcel/version, history, idempotency response and outbox atomically.<br/>5. Return success; relay and consumers update subscribers asynchronously.'],
    ['Alternatives','Foreign parcel: 404. Role denial: 403. Stale version/illegal transition: 409. Offline: queue for replay; same key reuses the saved response, conflicts need review. Failed photo upload blocks sending a photo reference; retry upload or omit the optional photo.'],
    ['Postconditions','State/history/outbox recorded atomically; stable eventId supports duplicate suppression. No exactly-once broker or external-send guarantee.']], [88,CW-88],9.5);end()

    start(13,'4 Data Design')
    para('Figure 5 presents the conceptual relationships between the main entities. Sections 4.1-4.2 describe their fields and persistence rules. PK identifies a primary key; FK identifies a foreign key; optional ownership is explicit.')
    nodes=[(60,153,'users','PK id; FK role_id<br/>email; password_hash; google_sub<br/>status; created_at',PALE),
           (342,153,'merchants','PK id; FK user_id<br/>approval; webhook_url<br/>webhook_secret_enc',GREEN),
           (60,286,'couriers','PK id; FK user_id, home_zone_id<br/>max_active_jobs; is_on_duty<br/>lock row for capacity changes',PALE),
           (342,286,'api_clients','PK id; FK merchant_id<br/>client_id; secret_hash; scopes<br/>revoked_at',PALE),
           (60,419,'parcels','PK id; FK customer_id nullable<br/>FK merchant_id, courier_id nullable<br/>origin_zone_id; dest_zone_id<br/>version; attempt_count; status',AMBER),
           (342,419,'zones / pricing_rules','zone PK id<br/>rule FK origin_zone_id, dest_zone_id<br/>size; integer fees; effective_from',PALE),
           (60,571,'parcel_status_history','PK id; FK parcel_id, changed_by<br/>status; recipient_name; failure_reason<br/>private proof_object_key; time',AMBER),
           (342,571,'outbox_events','PK id = envelope eventId<br/>aggregate_id; sequence; type<br/>payload; published_at',GREEN)]
    for x,y,name,fields,col in nodes:box(x,y,193,100,f'<b>{name}</b><br/>{fields}',col,fs=8.8)
    edge([(253,188),(342,188)],'1 : 0..1',label_xy=(297,178))
    edge([(157,253),(157,286)],'1 : 0..1',label_xy=(190,272))
    edge([(438,253),(438,286)],'1 : N',label_xy=(468,272))
    edge([(157,386),(157,419)],'1 : N (optional)',label_xy=(204,405))
    edge([(342,464),(253,464)],'1 : N, twice',label_xy=(298,450))
    edge([(157,519),(157,571)],'1 : N',label_xy=(180,548))
    edge([(253,493),(295,493),(295,619),(342,619)],'1 : N',label_xy=(310,610))
    caption(5,'Conceptual entity-relationship diagram (selected entities)',688)
    para('Customer owns zero or more parcels; customer_id is nullable for machine-created merchant orders. Merchant owns its orders through merchant_id; either customer_id or merchant_id must be present. Both parcel zone FKs and both pricing-rule zone FKs reference zones.');end()

    start(14,'4.1 Entity overview')
    text('Table 6: Required persistence contracts (conceptual)',style=CAP)
    table(['Structure','Required fields / invariants'],[
    ['Identity and merchant data','users/roles, merchants and api_clients as in Figure 5; one account role; hashed client secrets, encrypted webhook signing secrets; approved merchant required for machine orders.'],
    ['parcels','Unique tracking_no; nullable customer_id and merchant_id with at least one owner; nullable courier_id; pickup/drop-off addresses and towns; recipient name/phone; size/weight; fee_cents; origin_zone_id and dest_zone_id; status, version, attempt_count (0..3), scheduled date and timestamps.'],
    ['parcel_status_history','Append-only parcel_id, status, changed_by, changed_at, recipient_name when delivered, failure_reason when failed, note, nullable private proof_object_key. No permanent public proof URL. Assignment/reassignment entries also record old/new courier.'],
    ['quotes','id, owner type/id, normalised input or input hash, zone IDs, pricing-rule version, fee_cents, expires_at, consumed_parcel_id. Confirmation atomically checks owner, expiry and single consumption.'],
    ['refresh_tokens','id, user_id, family_id, token_hash, expires_at, used_at, revoked_at, replaced_by. Rotation consumes once; reuse revokes the family atomically.'],
    ['idempotency_records','Unique (principal, operation, key); request_hash; response status/body; created_at/expires_at. Concurrent same-key requests serialize; different-body reuse returns 409. Bind created parcels/updates to the record.'],
    ['outbox_events','Stable id is envelope eventId; aggregate_id, aggregate sequence, event_type, schema version, occurred_at, PII-minimised payload, created_at, published_at. Relay preserves eventId on every retry.'],
    ['processed_events / notifications','Unique (consumer, eventId); processing lease/state and completion time. Notifications add eventId, channel, template, masked recipient, status, sent_at and provider idempotency key when supported.'],
    ['webhook_deliveries / attempts','One delivery per (merchant_id,eventId,replay_run). Store attempt number 0..6, next_retry_at, state and a row per completed HTTP attempt: code/error, latency, timestamp. Unique attempt keys; durable worker leases prevent concurrent sends.']
    ],[113,CW-113],9.35)
    end()

    start(15,'4.2 Design decisions')
    bullet('<b>Append-only history.</b> Every committed status change has an actor and timestamp. Never rewrite past events; record corrections as new authorised entries. Current status and the history entry are committed in the same transaction.')
    bullet('<b>Integer money and durable quotes.</b> Store fee_cents, base_fee_cents and per_kg_cents as integers. Bind a quote to its principal and inputs, expire it after 15 minutes and consume it once, so later price changes cannot alter an accepted charge.')
    bullet('<b>Random tracking numbers.</b> Use SD- plus eight random characters from an unambiguous alphabet and a check character. Enforce uniqueness and retry a collision. The public endpoint is rate-limited and contains no private contact data.')
    bullet('<b>Versioned parcel writes.</b> Updates require expectedVersion and increment version. A zero-row update means conflict. This protects one parcel but does not protect capacity across different parcels.')
    bullet('<b>Courier capacity locking.</b> Every operation that changes assignment, active status or duty/capacity takes the affected courier row locks in sorted ID order before locking the parcel. Recheck active workload inside the transaction. Active means assigned and not DELIVERED, CANCELLED or terminal FAILED after attempt 3; retryable FAILED still reserves a slot. Reassignment and cancellation use the same protocol.')
    bullet('<b>Delivery attempts.</b> attempt_count starts at 0 and increments when entering OUT_FOR_DELIVERY. Failed attempt 1 or 2 may be scheduled again by Dispatcher/Admin; attempt 3 is final. The final FAILED state releases active capacity; the physical return journey is out of scope.')
    bullet('<b>Indexes follow bounded queries.</b> Plan indexes for tracking_no, (courier_id,current_status), (merchant_id,created_at), origin_zone_id and (parcel_id,changed_at). Lists use cursor pagination; workload queries consider only active parcels.')
    bullet('<b>Idempotency and cleanup.</b> Store principal-bound operation keys and replies for at least the supported offline/retry window (initial target: 7 days). After expiry, clients must reconcile server state before retrying creation. Retain processed-event keys for at least the broker/DLQ and replay windows; deduplication storage is not a proof of exactly-once external delivery.')
    note('Lock order is shared by all capacity-changing paths. If the observed courier changes before locks are acquired, roll back and retry from a fresh snapshot. Concurrent integration tests cover this lock protocol.');end()

    start(16,'5 System Architecture');sub('5.1 Options we considered')
    para('SwiftDrop uses a modular monolith with independent workers to combine transactional consistency with isolated outbound integrations.')
    table(['Option','Strengths','Trade-offs / decision'],[
    ['Layered monolith','Simple build, tests and deployment; background jobs are possible.','Layering does not force external calls into HTTP handlers. Keeping workers in one deployment ties failure recovery and scaling together. Not chosen for outbound integrations.'],
    ['Full microservices','Independent deployment and scaling; clear service ownership.','Ten students would take on distributed transactions, deployment and cross-service diagnosis before baseline features are ready. Rejected at this scale.'],
    ['Modular monolith with event-driven workers','One database transaction for related business changes; independent outbound retries and consumer scaling.','Core modules share one release and need enforced boundaries. Chosen: simple transactional core, isolated slow integrations.']], [106,159,CW-265],10)
    para('Parcel creation, pricing, assignment and status changes are closely linked and benefit from sharing a transactional Core API. Email, SMS and merchant HTTP endpoints are slow or unreliable, so workers handle them after commit. An outage in those integrations does not block a courier update.')
    para('The baseline processes are Core API with Socket.IO, Outbox Relay, Notification Service and Webhook Dispatcher. The AI Assistant Service is a separate optional process. Redis and the broker are infrastructure dependencies; neither is an external actor in use case models.')
    note('One PostgreSQL database is the system of record. The outbox closes the database-to-broker recording gap, while stable event identifiers and consumer state handle redelivery. It does not make database and broker publication one distributed transaction.');end()

    start(17,'5.2 The chosen architecture')
    box(60,110,475,54,'<b>PRESENTATION</b><br/>React SPA: Customer | public tracking | Merchant | Courier PWA | Dispatcher/Admin',PALE,fs=9.3)
    box(60,188,475,49,'<b>EDGE: Nginx</b> (optional Kubernetes Ingress)<br/>/api/v1, /oauth, /socket.io -&gt; Core API; /assistant -&gt; optional AI',PALE)
    edge([(297,164),(297,188)],'HTTPS / WSS',label_xy=(349,179))
    box(60,265,475,101,'<b>CORE API: Node.js 24, Express, TypeScript</b><br/>Auth | Parcels/Tracking | Pricing | Dispatch | Merchants | Reports/Admin<br/>Socket.IO gateway: separate public and authorised private rooms<br/>Controller -&gt; service -&gt; repository; state/history/outbox in one transaction',GREEN)
    edge([(297,237),(297,265)])
    box(60,400,140,67,'<b>Outbox Relay</b><br/>Reads committed rows<br/>Publish + confirms',AMBER)
    box(226,400,145,67,'<b>RabbitMQ</b><br/>Topic fan-out, fixed-delay<br/>retry queues, DLQs',AMBER)
    box(397,400,138,67,'<b>Notification / Webhook</b><br/>Separate consumers<br/>Scoped internal lookups',AMBER,fs=8.8)
    edge([(200,432),(226,432)]);edge([(371,432),(397,432)]);edge([(299,400),(299,366)],'realtime.q',True,label_xy=(330,386))
    edge([(468,400),(553,400),(553,315),(535,315)],'service JWT',True,label_xy=(537,384))
    box(60,505,140,65,'<b>PostgreSQL</b><br/>Business data, outbox,<br/>quotes, auth, dedup',PALE)
    box(226,505,145,65,'<b>Redis</b><br/>Socket.IO adapter,<br/>rate-limit counters',PALE)
    box(397,505,138,65,'<b>MinIO</b><br/>Private proof photos<br/>and PDF receipts',PALE)
    edge([(60,320),(42,320),(42,538),(60,538)],'Core SQL',label_xy=(42,486));edge([(130,467),(130,505)],'SQL',label_xy=(151,488))
    edge([(356,366),(380,366),(380,538),(371,538)],'Redis',label_xy=(389,486))
    edge([(506,366),(568,366),(568,537),(535,537)],'S3',label_xy=(568,481))
    box(60,608,230,64,'<b>External services</b><br/>Google OIDC, SMTP, mock SMS<br/>Merchant e-stores: scoped REST + webhooks',GREEN,fs=8.8)
    box(310,608,225,64,'<b>OPTIONAL AI Assistant Service</b><br/>Edge /assistant -&gt; AI -&gt; Core REST<br/>User JWT; LLM tools are read-only',GREEN,fs=8.8)
    caption(6,'Layered view of the SwiftDrop architecture',692)
    para('The edge terminates TLS, serves the SPA and applies rate limits. Core API accesses PostgreSQL, Redis and private MinIO objects. Outbound workers use restricted service identities for necessary contact/configuration lookups; they do not read arbitrary core tables.');end()

    start(18,'5.3 Inside the Core API')
    para('Each of the six modules owns its tables and exposes a small service interface. Dispatch calls PricingService.quote() when it needs a fee; it must not import another module\'s repositories. ESLint import rules enforce module boundaries in CI.')
    para('Protected requests pass through authentication, role/scope checks and boundary validation, then a thin controller, a domain service and a Prisma repository. Controllers translate HTTP; services hold rules and do not touch req or res. The shared kernel contains validation, money, event envelope and error/logging utilities.')
    sub('Worker-to-API access')
    para('Notification and webhook workers receive short-lived service JWTs with separate audiences and narrow scopes, such as notifications:lookup and webhooks:config. Internal lookup endpoints are reachable only on the private network, require the service identity, and bind access to the referenced event and parcel/merchant. They return only the contact or signing material needed for that task; secrets and payloads are never logged.')
    para('Workers may persist their own delivery, attempt and processed-event state. The Outbox Relay alone receives a database role restricted to claiming unpublished outbox rows and updating publication metadata. User JWTs are not reused for background processing.')
    sub('5.4 Why there is no separate BFF')
    para('The Core API already serves audience-specific routes: shared /api/v1/parcels plus /api/v1/merchant, /api/v1/courier and /api/v1/admin. These handlers return payloads suited to each screen, including a compact courier list for mobile data. A separate backend-for-frontend would add a deployable and a network hop without a demonstrated benefit at this scale.')
    para('Role-specific routes still use common domain services and ownership checks. Presentation grouping does not bypass authorisation. Public tracking and socket payloads use an explicit public projection rather than a full parcel serialisation.')
    note('The six modules share one release; independent worker processes provide outbound failure isolation, retry and scaling. The optional assistant uses normal authorised APIs and does not gain direct database access.');end()

    start(19,'5.5 Deployment view')
    box(60,112,210,45,'Browsers: SPA / Courier PWA',PALE);box(325,112,210,45,'Merchant systems',PALE)
    box(170,187,255,53,'<b>Nginx :80 / :443</b><br/>TLS, static web build and API/socket routing',GREEN)
    edge([(165,157),(165,176),(220,176),(220,187)]);edge([(430,157),(430,176),(375,176),(375,187)])
    box(60,280,250,80,'<b>core-api :4000</b><br/>HTTP + Socket.IO; one replica locally<br/>Scale with Redis adapter; same business rules',GREEN)
    box(365,280,170,80,'<b>OPTIONAL ai-assistant :5000</b><br/>/assistant from edge<br/>REST user JWT to Core',AMBER,fs=8.8)
    edge([(240,240),(240,280)]);edge([(425,211),(450,211),(450,280)],'/assistant',label_xy=(463,253));edge([(365,319),(310,319)],'REST',label_xy=(338,308))
    box(60,402,137,58,'PostgreSQL :5432<br/>Persistent pgdata',PALE)
    box(235,402,125,58,'Redis :6379<br/>Adapter / counters',PALE)
    box(398,402,137,58,'MinIO :9000<br/>Private object volume',PALE)
    edge([(115,360),(115,402)],'SQL',label_xy=(131,385));edge([(240,360),(297,360),(297,402)]);edge([(310,345),(467,345),(467,402)],'S3',label_xy=(463,380))
    box(60,500,137,58,'Outbox Relay<br/>Outbox-only DB role',AMBER,fs=9)
    box(235,500,125,58,'RabbitMQ :5672<br/>Persistent broker data',AMBER,fs=8.7)
    box(398,500,137,58,'Notification Service<br/>Webhook Dispatcher',AMBER,fs=8.7)
    edge([(128,460),(128,500)],'poll SQL',label_xy=(158,482));edge([(197,529),(235,529)]);edge([(360,529),(398,529)]);edge([(298,500),(298,481),(215,481),(215,360)],'realtime.q to Core',True,label_xy=(268,470))
    box(60,599,475,70,'<b>Local baseline: Docker Compose private network</b><br/>Mailpit and SMS mock for development. Only edge ports exposed publicly.<br/>Workers call internal Core endpoints with least-privilege service JWTs.<br/>Google / SMTP / merchant HTTPS; optional AI calls LLM provider.',PALE,fs=9)
    caption(7,'Container deployment view (baseline and optional)',688)
    para('Compose is the baseline. Kubernetes/Helm is stretch: Deployments for stateless processes, StatefulSets/PVCs for stateful services, Ingress/TLS, ConfigMaps and Secrets. Use multi-stage images and health probes.');end()

    start(20,'6 Integration Design');sub('6.1 Integration patterns used')
    para('Synchronous requests support immediate decisions, while asynchronous events handle independent integrations. The following patterns define these interactions.')
    text('Table 8: Integration patterns and justification',style=CAP)
    table(['Pattern','Where used','Why it fits'],[
    ['Request / reply REST','SPA and merchant orders; optional assistant tools','The caller needs a quote, tracking number or validation response immediately.'],
    ['Publish / subscribe','Committed parcel events to notification, webhook and realtime consumers','Consumers can run and fail independently; the producer does not wait for external work.'],
    ['Transactional outbox','Parcel/history and outbox row in one PostgreSQL transaction','Atomic durable recording; relay retries broker publication after commit. At least once, not exactly once.'],
    ['Signed webhook','Webhook Dispatcher to merchant HTTPS endpoint','Pushes changes without merchant polling; HMAC and timestamp authenticate each delivery attempt.'],
    ['Retry with backoff and DLQ','Webhook delivery and bounded notification retries','Persistent bookkeeping and broker-assisted delays cover transient outages, then expose failures for inspection.'],
    ['Server push','Socket.IO gateway to tracking clients','Immediate UI feedback with long-poll fallback and reconnect snapshot; separate public/private rooms protect data.'],
    ['OAuth 2.0 / OpenID Connect','Google code flow with PKCE; merchant client credentials','Standard user and machine authentication with separate identities and scopes.']
    ],[105,157,CW-262],10)
    para('The baseline has three async workers: Outbox Relay, Notification Service and Webhook Dispatcher. Realtime consumption stays inside Core API. An optional AI service is not counted as a core worker.');end()

    start(21,'6.2 Event flow')
    box(60,114,475,62,'<b>Core API transaction</b><br/>Validate role/ownership/state/version; write parcel + history + idempotency reply + outbox<br/>COMMIT before the request returns; no broker publish inside this transaction',GREEN,fs=9)
    box(172,207,252,48,'Outbox Relay: claim committed rows<br/>publish with confirms; then mark published_at',AMBER)
    edge([(297,176),(297,207)],'after commit',label_xy=(340,194))
    box(172,283,252,42,'Topic exchange: swiftdrop.events',AMBER);edge([(297,255),(297,283)],'stable eventId',label_xy=(342,272))
    for x,lab in [(60,'realtime.q<br/>parcel.#'),(235,'notifications.q<br/>parcel.created + parcel.status.*'),(410,'webhooks.q<br/>parcel.#')]:
        box(x,362,125,58,lab,PALE,fs=8.5)
    edge([(223,325),(223,343),(123,343),(123,362)]);edge([(298,325),(298,362)]);edge([(372,325),(372,343),(472,343),(472,362)])
    for x,lab in [(60,'Core Socket.IO<br/>public/private projections'),(235,'Notification Service<br/>booking/status templates'),(410,'Webhook Dispatcher<br/>fresh HMAC every attempt')]:box(x,456,125,54,lab,GREEN,fs=8.5);edge([(x+62,420),(x+62,456)])
    box(359,550,176,59,'Fixed-delay retry queues<br/>30 / 60 / 120 / 240 / 480 / 960 s<br/>Dedicated return exchange',AMBER,fs=8.5)
    edge([(472,510),(472,550)],'failure, confirms then ack',label_xy=(451,536))
    edge([(535,579),(555,579),(555,391),(535,391)],'retry',True,label_xy=(555,440))
    box(60,550,238,59,'Failed deliveries: durable state + webhooks.dlq<br/>After attempt 6 (seven total HTTP attempts)<br/>Admin-only audited replay; same eventId',RED,fs=8.6)
    edge([(410,483),(385,483),(385,528),(330,528),(330,579),(298,579)],'after attempt 6',label_xy=(372,520))
    caption(8,'Event-driven integration through RabbitMQ',632)
    para('The relay polls about once per second. A publish followed by a crash before published_at may publish the same event again. Consumers persist progress and acknowledge only after completion or a confirmed durable retry/DLQ handoff. Booking confirmations have an explicit parcel.created binding.')
    para('Retry queues dead-letter only through the dedicated direct return exchange into webhooks.q, so retries never re-fire notifications or live tracking. Queue delay is approximate and can increase during outages; see Section 7.7.');end()

    start(22,'6.3 Event contract')
    code='''{<br/>&nbsp;&nbsp;"eventId": "6f1c2a9e-3b0d-4c7e-9a51-1d2f0c8b7e44",<br/>&nbsp;&nbsp;"type": "parcel.status.changed", "version": 1,<br/>&nbsp;&nbsp;"occurredAt": "2026-10-23T09:14:05Z", "sequence": 4,<br/>&nbsp;&nbsp;"data": {"parcelId": "p_1042", "trackingNo": "SD-7KQ2M9XA-P",<br/>&nbsp;&nbsp;&nbsp;&nbsp;"merchantId": "m_1042", "from": "IN_TRANSIT",<br/>&nbsp;&nbsp;&nbsp;&nbsp;"to": "OUT_FOR_DELIVERY"}<br/>}'''
    text(code,style=ParagraphStyle('code',fontName='Courier',fontSize=9,leading=13))
    para('eventId is the stable outbox primary key; sequence increases with each parcel change; version is the envelope schema version. Realtime discards stale sequence numbers and reloads a snapshot on gaps/reconnect. Audit/notification/webhook consumers retain every unique eventId: a later sequence is not permission to discard an unsent earlier business event.')
    para('Events omit names, phone numbers, addresses, photos and free-text notes. A worker needing contact/configuration data calls an internal event-bound endpoint using its own restricted service JWT (Section 5.3). Payloads are validated on consumption; unknown schema versions are parked for inspection.')
    sub('6.4 Queues and routing keys')
    text('Table 9: RabbitMQ queues',style=CAP)
    table(['Queue / binding','Consumer and failure handling'],[
    ['realtime.q / parcel.#','Core Socket.IO gateway; 60-second TTL. Lost/expired live updates are recovered from an authorised REST snapshot, not treated as a durable event history.'],
    ['notifications.q / parcel.created and parcel.status.*','Notification Service; separate booking/status templates. At most three redeliveries after the initial attempt, then confirmed notifications.dlq handoff and operator visibility.'],
    ['webhooks.q / parcel.#','Webhook Dispatcher; initialise attempt=0. Persist failures and schedule attempts 1..6 through the fixed-delay queues; no retry on the topic exchange.'],
    ['webhooks.retry.{30,60,120,240,480,960}.q','No consumers. One fixed message TTL per queue; dedicated direct dead-letter return exchange routes only to webhooks.q. Configure quorum at-least-once dead-lettering and persistent storage.'],
    ['webhooks.dlq / dedicated dead-letter route','Failed after attempt 6; retained 14 days, visible in delivery logs. Only Admin may replay; durable replay run retains original eventId.']
    ],[181,CW-181],9.1);end()

    start(23,'6.5 Reliability guarantees')
    para('A successful business transaction records parcel state, append-only history and an outbox event together. Publication and durable consumer queues provide at-least-once processing under the configured durability assumptions. A relay crash between confirm and marking published_at causes redelivery, so the same stable eventId is preserved.')
    para('Consumers claim a unique (consumer,eventId) record under a lease and persist progress. This suppresses duplicate processing, but external side effects have a crash window: an email or HTTP request can succeed before local completion is recorded. Use a provider idempotency key where supported; otherwise a duplicate email remains possible. Merchants deduplicate webhook eventId before business effects.')
    para('Use durable exchanges/queues, persistent messages, publisher confirms and mandatory routing checks. Retry and DLQ transfers are confirmed before acknowledging the source. Fixed-delay quorum queues must enable at-least-once dead-lettering with a compatible overflow policy and persistent volumes. Missing routes, unavailable targets, exhausted disk or permanent storage loss are operational failures; there is no unconditional no-loss guarantee.')
    sub('6.6 Real-time tracking')
    para('Public clients join public:&lt;trackingNo&gt; after tracking-number validation and rate limiting. Every payload in that room is a public projection containing status, time, town and sequence only. Authenticated clients request private:&lt;parcelId&gt;; the server authorises ownership or current staff/courier access before membership and emits a separate private projection.')
    para('Never join a public socket to a private room or emit a full parcel into a public room. Reassignment/revocation invalidates access and removes private subscriptions; reconnect always reauthorises. Do not send recipient contact details through the broker or depend on a client-side filter to hide them.')
    para('Socket.IO falls back to long-polling when WebSockets are unavailable. Redis adapter broadcasts across API replicas. Multi-replica polling needs sticky sessions at the proxy. Clients deduplicate by sequence and fetch the latest authorised REST snapshot after reconnect or a gap, because realtime.q has a short TTL.')
    note('Email, merchant webhooks and live tracking have different durability needs. Eventual delivery targets depend on the broker, workers and external endpoints being available; delivery latency increases during outages.');end()
    start(24,'7 Key Flows')
    para('Sequences show interactions; state and activity diagrams show lifecycle and decisions. Dashed arrows denote replies or asynchronous messages; asynchronous broker transfers are labelled. The Outbox Relay is a separate participant after commit.')
    sub('7.1 Creating a delivery')
    yy=sequence(9,['React SPA','Core API','Pricing','PostgreSQL','Outbox Relay','RabbitMQ'],[
    (0,1,'POST /quotes (user JWT)','call'),(1,2,'Validate; resolve zones; price','call'),(2,1,'Fee and rule version','reply'),
    (1,3,'Save owner-bound 15-minute quote','call'),(1,0,'200 quoteId, fee, expiresAt','reply'),
    (0,1,'Confirm quoteId + Idempotency-Key','call'),(1,3,'BEGIN: quote + parcel/history/outbox/key','call'),
    (3,1,'COMMIT (all writes or none)','reply'),(1,0,'201 trackingNo + receipt link','reply'),
    (4,3,'Claim committed unpublished events','call'),(4,5,'parcel.created; await confirm','async'),(4,3,'Mark published_at after confirm','call')],top=184,row=30)
    caption(9,'Sequence: customer creates a delivery',yy)
    para('Two requests let the customer inspect the fee before booking. A quote is persisted and bound to the authenticated owner and exact inputs. Confirmation consumes it once inside the transaction. Same-key/body retries reuse the saved response; different-body reuse returns 409. The booking response never waits for email or broker delivery.');end()

    start(25,'7.2 Merchant creates an order through the API')
    yy=sequence(10,['Merchant e-store','Core / Auth','PostgreSQL','Outbox Relay','RabbitMQ','Webhook worker'],[
    (0,1,'POST /oauth/token; client credentials','call'),(1,0,'Scoped access JWT (15 min)','reply'),
    (0,1,'POST /merchant/orders + operation key','call'),(1,2,'Validate; save order/history/outbox/key','call'),
    (2,1,'COMMIT; save idempotency response','reply'),(1,0,'201 trackingNo and fee','reply'),
    (3,2,'Claim committed event','call'),(3,4,'Publish parcel.created with confirms','async'),
    (4,5,'Deliver from webhooks.q','async'),(5,0,'POST payload + fresh HMAC/timestamp + eventId','call'),
    (0,5,'2xx: record success, then ack','reply')],top=127,row=34)
    caption(10,'Sequence: merchant API order and webhook',yy)
    para('Every order validates orders:write, current merchant approval and body fields before writing. Machine orders use merchant_id and may leave customer_id null. Merchant queries are scoped to that merchant. API creation uses an idempotency record to protect network retries and concurrent duplicate requests.')
    para('On timeout/non-2xx, the webhook worker persists the failure and confirms a durable retry handoff before acknowledging. Section 7.7 defines every attempt and replay branch. Each retry reloads current configuration and signs a new timestamp; the stable eventId lets the merchant suppress duplicate business effects.');end()

    start(26,'7.3 Courier status update triggering notifications')
    yy=sequence(11,['Courier PWA','Core / Socket.IO','PostgreSQL','Outbox Relay','RabbitMQ','Notification','Webhook'],[
    (0,1,'PATCH status + version + operation key','call'),(1,2,'Validate; atomic status write','call'),
    (2,1,'COMMIT; version + 1','reply'),(1,0,'200 saved response (or 404/409)','reply'),
    (3,2,'Claim committed status event','call'),(3,4,'Publish status event with confirms','async'),
    (4,5,'notifications.q','async'),(4,6,'webhooks.q','async'),(4,1,'realtime.q','async'),
    (1,0,'Emit authorised private projection','async')],top=125,row=34)
    caption(11,'Sequence: courier status update and independent fan-out',yy)
    para('Courier ownership misses return 404, role denials 403, and stale versions or illegal transitions 409. Validate recipient name for DELIVERED and fixed-list reason for FAILED. Private photo upload must complete and be authorised before a proof_object_key is accepted. Capacity-changing transitions use the shared courier-lock protocol.')
    para('Offline operations retain a stable key, expectedVersion and dependency order per parcel. On reconnect, refresh the authorised snapshot, retry pending uploads, then replay in order. Deduplicate accepted operations. Pause stale/conflicting operations for user review, and surface 404 after reassignment. Never fabricate success or blindly replace the current version. Queue loss on a lost device remains a limitation.');end()

    start(27);end()  # Original Google/PKCE sequence and explanatory prose retained.

    start(28,'7.5 Parcel lifecycle')
    for x,y,lab in [(80,124,'CREATED'),(80,229,'PICKED_UP'),(80,334,'IN_TRANSIT'),(80,439,'OUT_FOR_DELIVERY'),(80,575,'DELIVERED'),(370,124,'CANCELLED'),(370,439,'FAILED')]:box(x,y,145,48,lab,GREEN if lab in ('DELIVERED','CANCELLED') else PALE)
    edge([(153,172),(153,229)],'confirm pickup',label_xy=(202,205))
    edge([(153,277),(153,334)],'leaves pickup / hub',label_xy=(215,310))
    edge([(153,382),(153,439)],'attempt_count += 1',label_xy=(217,416))
    edge([(153,487),(153,575)],'recipient name; optional photo',label_xy=(203,540))
    edge([(225,148),(370,148)],'owner/staff: before pickup',label_xy=(296,137))
    edge([(225,463),(370,463)],'fixed-list failure reason',label_xy=(296,451))
    edge([(443,439),(443,358),(225,358)],'Dispatcher/Admin reschedules if attempt_count < 3',True,label_xy=(376,345))
    box(352,568,181,69,'FAILED with attempt_count = 3<br/>Terminal delivery failure<br/>Release capacity; physical return<br/>journey outside scope',RED,fs=8.8)
    edge([(443,487),(443,568)],'third failure',label_xy=(477,534))
    caption(13,'State diagram: parcel lifecycle',656)
    para('There are at most three delivery attempts: the first attempt plus two re-attempts. attempt_count begins at 0 and increments only on IN_TRANSIT to OUT_FOR_DELIVERY. A failed attempt 1 or 2 reserves capacity until rescheduled, reassigned or cancelled through an authorised path; cancellation itself is permitted only before pickup.')
    para('Only Dispatcher/Admin schedules a re-attempt. FAILED after attempt 3 is terminal and releases capacity. DELIVERED and CANCELLED are terminal. Assignment/reassignment changes courier and version, not lifecycle status.');end()

    start(29,'7.6 Dispatcher assigns a parcel')
    box(162,108,270,38,'Dispatcher/Admin selects parcel, expectedVersion<br/>and proposed courier (initial or reassign)',PALE,fs=8.8)
    box(162,171,270,49,'BEGIN: lock old/new courier rows in sorted ID order,<br/>then parcel; recheck role, version, assignment<br/>and eligible lifecycle state',PALE,fs=8.8);edge([(297,146),(297,171)])
    diamond(182,242,230,67,'Current version and<br/>eligible assignment?');edge([(297,220),(297,242)])
    box(440,246,95,61,'No: ROLLBACK<br/>409 conflict;<br/>refresh queue',RED,fs=8.5);edge([(412,276),(440,276)],'no',label_xy=(425,266))
    box(162,334,270,48,'If courier unchanged: take side exit.<br/>Otherwise recount active jobs under lock;<br/>recheck on duty and configured limit.',PALE,fs=8.6);edge([(297,309),(297,334)],'yes',label_xy=(311,324))
    box(440,329,95,57,'Same courier:<br/>COMMIT no-op;<br/>return success',GREEN,fs=8.5);edge([(432,354),(440,354)])
    diamond(182,405,230,65,'On duty and capacity<br/>available for this change?');edge([(297,382),(297,405)])
    box(440,406,95,65,'No: ROLLBACK<br/>capacity conflict;<br/>choose courier',AMBER,fs=8.5);edge([(412,438),(440,438)],'no',label_xy=(425,428))
    box(162,494,270,49,'Set courier_id; version = version + 1<br/>Record assignment/reassignment history + outbox.<br/>Old/new workload changes are atomic.',PALE,fs=8.8);edge([(297,470),(297,494)],'yes',label_xy=(311,485))
    box(162,566,270,36,'COMMIT, then respond to dispatcher',GREEN);edge([(297,543),(297,566)])
    box(162,625,270,43,'Separate relay publishes assignment event<br/>after commit; courier list updates live',GREEN,fs=8.8);edge([(297,602),(297,625)],'async',True,label_xy=(315,616))
    caption(14,'Activity diagram: assignment and reassignment',685)
    para('All assignment, duty and active-status changes use this lock order. Two different parcels cannot both claim the same final courier slot. If courier ownership changed before locks were acquired, restart from a fresh snapshot. Eligible reassignment is allowed for nonterminal parcels; first assignment requires an unassigned CREATED parcel.');end()

    start(30,'7.7 Webhook delivery and retry')
    box(62,109,263,43,'Consume webhooks.q; attempt = 0 initially<br/>Claim durable delivery/attempt lease',PALE,fs=8.8)
    box(62,173,263,43,'Reload config; resume durable progress.<br/>Ack only completed/confirmed duplicate.',PALE,fs=8.8);edge([(194,152),(194,173)])
    diamond(93,238,202,58,'Webhook URL configured<br/>and valid?');edge([(194,216),(194,238)])
    box(363,240,172,54,'No URL: persist SKIPPED; ack.<br/>Unsafe/invalid URL: persist failure;<br/>park safely, then ack.',AMBER,fs=8.6);edge([(295,267),(363,267)],'no',label_xy=(328,257))
    box(62,319,263,50,'Build payload with original eventId.<br/>Fresh timestamp + HMAC-SHA256 signature.<br/>POST timeout 5 s; HTTPS/SSRF checks.',PALE,fs=8.7);edge([(194,296),(194,319)],'yes',label_xy=(209,309))
    diamond(102,390,184,55,'2xx response?');edge([(194,369),(194,390)])
    box(363,391,172,53,'Yes: persist SUCCESS<br/>with code/latency;<br/>complete claim, then ack.',GREEN,fs=8.8);edge([(286,418),(363,418)],'yes',label_xy=(325,408))
    box(62,467,263,40,'Persist failure, attempt number, error/code<br/>and next_retry_at before handoff.',RED,fs=8.8);edge([(194,445),(194,467)],'no',label_xy=(209,457))
    diamond(103,527,183,55,'attempt &lt; 6?');edge([(194,507),(194,527)])
    box(363,517,172,73,'Yes: next attempt = attempt + 1.<br/>Confirm persistent publish to its<br/>fixed-delay queue, THEN ack source.<br/>TTL return -&gt; webhooks.q<br/>Reload config and re-sign.',AMBER,fs=8.6);edge([(286,554),(363,554)],'yes',label_xy=(325,544))
    box(62,607,263,51,'No: persist FAILED; confirm webhooks.dlq<br/>handoff, then ack. Show failure to merchant;<br/>only Admin can start an audited replay run.',RED,fs=8.6);edge([(194,582),(194,607)],'no',label_xy=(209,596))
    caption(15,'Activity diagram: webhook delivery with retry',675)
    text('One initial HTTP attempt (0) plus six retries (1..6): waits of 30, 60, 120, 240, 480 and 960 seconds; total 1,890 seconds (31.5 minutes), plus request/queue time. Re-delivery after an unconfirmed handoff resumes durable state; do not advance the counter or resend a completed attempt. Replays keep eventId and use a new audited run ID.',style=SMALL)
    text('Fixed-delay queues avoid mixed-TTL head blocking. Use quorum at-least-once dead-lettering and persistent volumes; delay is approximate. If persistence or confirm fails, leave the source unacknowledged. An external success before local recording can still duplicate delivery.',style=SMALL);end()

    start(31);end()  # Original design-pattern table and pricing example retained.

    start(32,'8.2 Principles')
    bullet('<b>Single responsibility.</b> Controllers translate HTTP, services hold business rules, repositories store data. The Notification Service sends messages; it does not decide which parcel transitions are legal.')
    bullet('<b>Open/closed.</b> Pricing strategies, notification adapters and event consumers expose narrow contracts so new implementations can be added without rewriting booking orchestration. New requirements may still require deliberate interface changes.')
    bullet('<b>Liskov substitution.</b> PricingStrategy and SmsSender implementations must satisfy the same documented contracts. Shared contract tests check each implementation against those requirements.')
    bullet('<b>Interface segregation.</b> Courier code depends on a narrow status-update interface rather than administrative methods it does not need. Worker lookup scopes expose only the data required for the event being processed.')
    bullet('<b>Dependency inversion.</b> Domain services depend on interfaces. Infrastructure provides Prisma repositories, AMQP publishers and email/SMS adapters, injected through constructors.')
    bullet('<b>DRY.</b> Keep validation schemas, allowed status transitions, money rules and event envelopes in one maintained contract package. Reuse the schema across API and UI, while always validating at the API boundary.')
    bullet('<b>KISS and YAGNI.</b> The design avoids full microservices, a service mesh and event sourcing. They are unnecessary for the current team and scale. Independent workers address the specific need for outbound failure isolation.')
    end()

    start(33,'9 Security Design');sub('9.1 Authentication')
    bullet('Hash passwords with bcrypt cost 12; reject inputs beyond its 72-byte UTF-8 limit rather than silently truncating. Do not log passwords or tokens.')
    bullet('Use RS256 access JWTs valid for 15 minutes, containing user ID, role and jti plus standard issuer, audience and expiry claims. Do not include contact details.')
    bullet('Use random refresh tokens stored hashed, with family and reuse-detection state. Send via HttpOnly, Secure, SameSite=Strict cookies; consume and rotate atomically. Reuse revokes the family. Enforce origin/CSRF checks for cookie-authenticated operations.')
    bullet('Google uses backend-handled OpenID Connect code flow with PKCE and state, as shown in Section 7.4. Verify signature, issuer, audience and expiry; identify accounts by google_sub rather than silently merging by email.')
    bullet('Rate-limit login/token endpoints by IP and account; check current account status for privileged operations.')
    sub('9.2 Authorisation')
    para('Authenticate, check role/scope, then scope the database operation to the owner or current courier. A foreign or nonexistent parcel returns the same 404 response. A known route forbidden to the caller\'s role/scope returns 403. Admin inherits Dispatcher operations; replay remains Admin-only. Machine clients remain limited by merchant ownership and token scope.')
    sub('9.3 Merchant API and webhooks')
    bullet('Show client secrets once and store only their hash. Support rotation/revocation; issue short-lived tokens with orders:read and/or orders:write scopes.')
    bullet('Sign the exact HTTP body using HMAC-SHA256 with a fresh timestamp for every attempt. Merchant validates the timestamp (five-minute window), signature and eventId deduplication. Store signing secrets encrypted; never expose them in logs.')
    bullet('Require HTTPS webhook URLs. Validate resolved IPv4/IPv6 destinations on every connection; reject private/loopback/link-local ranges and redirects. A development-only allowlist permits the mock receiver; it is empty in production. Apply timeouts, request-size bounds and per-client rate limits.');end()

    start(34,'9.4 Personal data')
    bullet('Validate all external input at API and event boundaries: phone format, positive bounded weight, known statuses/zones and length-limited notes. Use parameterised queries; never interpolate user input into SQL.')
    bullet('Redact passwords, tokens, secrets, phone numbers and addresses in logs. Return generic errors with a correlation ID. Detailed server diagnostics also remain redacted.')
    bullet('Public tracking shows status, time and town only. Full addresses/contact details require the owner, current assigned courier or authorised staff. Private proof objects and receipts are accessible only through authorised short-lived signed URLs; validate MIME type/size and ownership at upload/finalisation.')
    sub('9.5 Secrets and configuration')
    para('Deployment configuration reads secrets from environment variables or secret storage and commits only placeholder examples. The optional Kubernetes deployment uses ConfigMaps for non-sensitive settings and Secrets with restricted RBAC for credentials. CI includes secret scanning to detect accidentally committed credentials.')
    sub('9.6 Threats and mitigations')
    text('Table 11: Threat model summary (STRIDE)',style=CAP)
    table(['Threat','Example','Required mitigation'],[
    ['Spoofing','Fake merchant integration','Scoped client-credentials tokens, hashed secrets, approval/revocation checks.'],
    ['Tampering','Modified webhook body','HTTPS, exact-body HMAC, fresh timestamp and eventId validation.'],
    ['Repudiation','Disputed delivery update','Append-only actor/time/status history, name and optional private proof.'],
    ['Information disclosure','Guessed tracking number','Random IDs, rate limits, public projection and authorised private rooms.'],
    ['Denial of service','Quote/webhook flood','Rate limits, bounded inputs, timeouts, bounded retries and pagination.'],
    ['Elevation of privilege','Courier changes parcel ID','Role + ownership-scoped query, current assignment/version, negative tests.']
    ],[98,139,CW-237],9.4);end()

    start(35,'10 API Design');sub('10.1 Conventions')
    para('Version business endpoints under /api/v1; /oauth/token is the OAuth endpoint. Use plural resources, cursor pagination and one problem-details error format. OpenAPI generation from Zod and /api/docs are planned. Creation and courier mutations use a principal-scoped Idempotency-Key with request hash; state changes require expectedVersion. All paths below are full paths.')
    sub('10.2 Main endpoints')
    text('Table 12: Key REST endpoints (summary; not exhaustive)',style=CAP)
    table(['Method and path','Role / purpose'],[
    ['POST /api/v1/auth/register<br/>POST /api/v1/auth/login','Public: customer sign-up and login.'],
    ['GET /api/v1/auth/google<br/>GET /api/v1/auth/google/callback','Public: Google code flow.'],
    ['POST /api/v1/auth/refresh','Refresh cookie: rotate family token, issue access JWT.'],
    ['POST /api/v1/quotes','Customer, Merchant, Dispatcher, Admin: fee quote.'],
    ['POST /api/v1/parcels','Customer, Dispatcher, Admin: create from quote. Merchant machine creation uses merchant/orders.'],
    ['GET /api/v1/parcels<br/>GET /api/v1/parcels/{id}<br/>GET /api/v1/parcels/{id}/receipt','Customer/Merchant: own; Courier: assigned detail; Dispatcher/Admin: authorised operational view. Receipts only owner or staff.'],
    ['GET /api/v1/track/{trackingNo}','Public: status, time and town only.'],
    ['POST /oauth/token','Approved Merchant client: client-credentials token.'],
    ['POST /api/v1/merchant/register<br/>PUT /api/v1/merchant/webhook','Public registration (pending); Merchant owns webhook settings; Admin may manage.'],
    ['POST /api/v1/merchant/orders<br/>GET /api/v1/merchant/orders','Machine token requires orders:write/read; approved merchant, owner-scoped queries. Dashboard Merchant JWT permits own read.'],
    ['GET /api/v1/courier/parcels?date=today<br/>PATCH /api/v1/courier/parcels/{id}/status<br/>POST /api/v1/courier/parcels/{id}/proof','Courier: assigned parcels only; expectedVersion + operation key for update; private proof upload/finalise.']
    ],[265,CW-265],9.25);end()

    start(36,'10.2 Main endpoints (continued)')
    table(['Method and path','Role / purpose'],[
    ['GET /api/v1/admin/parcels?status=CREATED&amp;assigned=false','Dispatcher, Admin: unassigned CREATED queue; assigned=false derives from courier_id IS NULL, not a lifecycle status.'],
    ['POST /api/v1/admin/parcels/{id}/assignment<br/>GET /api/v1/admin/couriers/workload','Dispatcher, Admin: assign/reassign with expectedVersion; view active workload.'],
    ['PATCH /api/v1/admin/parcels/{id}/status<br/>POST /api/v1/admin/parcels/{id}/reattempt','Dispatcher, Admin: legal operational status update; schedule re-attempt only after FAILED with attempt_count &lt; 3.'],
    ['POST /api/v1/parcels/{id}/cancel','Customer/Merchant owner, Dispatcher, Admin: cancel only before pickup; version and shared capacity locks required. Merchant machine needs orders:write.'],
    ['PATCH /api/v1/admin/merchants/{id}<br/>POST/PATCH /api/v1/admin/users<br/>POST/PATCH /api/v1/admin/couriers','Admin: approve merchants, provision/suspend users and couriers.'],
    ['CRUD /api/v1/admin/zones<br/>CRUD /api/v1/admin/pricing-rules','Admin: zones and pricing.'],
    ['GET /api/v1/admin/reports/daily','Dispatcher, Admin: daily reports and CSV export.'],
    ['POST /api/v1/admin/webhook-deliveries/{id}/replay','Admin only: audited replay run; preserve original eventId; no new notification/tracking event.']
    ],[265,CW-265],9.2)
    sub('10.3 Error format')
    text('HTTP/1.1 409 Conflict<br/>Content-Type: application/problem+json<br/><br/>{<br/>&nbsp;&nbsp;"type": "https://api.swiftdrop.lk/errors/invalid-transition",<br/>&nbsp;&nbsp;"title": "Status change not allowed", "status": 409,<br/>&nbsp;&nbsp;"detail": "A parcel in CREATED cannot move to DELIVERED.",<br/>&nbsp;&nbsp;"correlationId": "c0a8012e-5f3b"<br/>}',style=ParagraphStyle('err',fontName='Courier',fontSize=9.1,leading=13))
    note('401: missing/invalid authentication. 403: known role/scope denial. 404: ownership-scoped miss. 409: stale version, illegal transition or conflicting operation key. Errors do not disclose foreign parcel data.');end()

    start(37,'11 Testing Approach')
    para('The testing strategy covers domain rules, database transactions, access control, event delivery and user interfaces. Integration and concurrency tests exercise failure paths as well as successful operations.')
    text('Table 13: Planned test levels',style=CAP)
    table(['Level / tools','Meaningful scenarios'],[
    ['Unit: Jest','Integer pricing and quote expiry; legal transitions; proof/name and failure reason rules; first plus two re-attempts; public/private payload projection.'],
    ['Integration: Supertest, Testcontainers (PostgreSQL, RabbitMQ)','Atomic state/history/outbox/idempotency writes and rollback; relay crash after confirm; duplicate operation keys; refreshed token reuse; private proof authorisation.'],
    ['Authorisation: tokens for every role and machine scope','Foreign courier/customer/merchant lookup/update returns 404; wrong role/scope returns 403; admin inherits dispatch; replay denied to Dispatcher; private socket room reauthorises after reassignment.'],
    ['Concurrency: real PostgreSQL transactions','Same parcel assigned twice; two parcels compete for one courier slot; reassignment locks old/new couriers; duty changes, delivery, cancellation and capacity changes race without exceeding the limit.'],
    ['Events: real broker, mock SMTP/HTTP','Booking reaches parcel.created template; tested duplicate suppression; acknowledge only after durable completion/handoff. Crash after external send is tested/documented as a possible duplicate without provider idempotency.'],
    ['Retry / replay / failure','No URL, unsafe URL, 2xx, timeout, non-2xx; attempts 0..6 and 31.5-minute minimum waits; fresh signatures; failed confirms leave source unacked; restart recovery, DLQ retention and admin-only replay.'],
    ['Frontend: Vitest, React Testing Library','Validation and duplicate-submit prevention; loading/empty/error/success states; keyboard/focus and labels; reduced motion; narrow/mobile layout; offline upload/replay/conflict handling.'],
    ['Realtime / privacy','Public room contains only approved fields; unauthorised joins fail; Redis multi-replica fan-out; snapshot after expiry, gap and reconnect; polling/sticky-session behavior.']
    ],[132,CW-132],9.5)
    para('Target at least 80% service/domain line coverage using Jest/Istanbul HTML and lcov output. Combine coverage with integration, concurrency and access-control tests. Manual acceptance covers complete user journeys, keyboard navigation, mobile layouts and offline recovery.');end()

    start(38,'12 Bonus Features (optional stretch)');sub('12.1 Kubernetes deployment')
    para('After the baseline is demoable, a Helm chart may deploy stateless services as Deployments and stateful dependencies as StatefulSets with PVCs. Ingress replaces Nginx routing/TLS; ConfigMaps and restricted Secrets hold configuration. Readiness/liveness probes and scaling values are validated for the deployment environment.')
    sub('12.2 AI delivery assistant')
    box(62,291,143,58,'Customer<br/>Chat widget in React SPA',PALE)
    box(254,291,278,58,'Edge /assistant -&gt; optional AI service<br/>LLM tool calling with user authorisation',GREEN)
    edge([(205,320),(254,320)],'HTTPS',label_xy=(229,309))
    box(254,395,278,79,'<b>Read-only MCP tools</b><br/>quote_delivery_fee | get_parcel_status<br/>list_my_parcels | find_zone<br/>Validate tool inputs; never trust model instructions',AMBER)
    edge([(393,349),(393,395)])
    box(254,518,278,62,'Core API /api/v1/...<br/>User JWT + normal role/ownership checks<br/>No direct SQL or privileged service credentials',PALE)
    edge([(393,474),(393,518)],'authorised REST',label_xy=(442,503))
    caption(16,'Optional AI assistant through authenticated API tools',605)
    para('The assistant can answer tracking and fee questions by calling real APIs rather than guessing. Tools are read-only: they cannot create, update or cancel parcels. A quote calculation may persist a short-lived quote but cannot create a delivery. The assistant can access only what the user can access.')
    para('Keep provider keys on the service, bound request/tool budgets, and minimise personal data sent to the model. Tool failures and unavailable providers produce an honest unavailable response. Optional AI traffic follows the same explicit edge route in both logical and deployment views.');end()

    start(39,'13 Conclusion')
    para('The design rests on complementary decisions. A modular Core API keeps related business rules and database transactions together. A transactional outbox records events with business changes, then independent RabbitMQ consumers handle slow outbound work after commit. Role/scope checks and ownership-scoped queries provide explicit access boundaries.')
    para('The outbox promises atomic recording and at-least-once publication under stated durability assumptions. Stable event IDs, durable progress and receiver/provider idempotency reduce duplicates; external-send crash windows remain explicit. Courier capacity is protected across parcels by shared row locks, while version checks prevent stale parcel writes.')
    para('Public tracking has a deliberately small projection and separate socket rooms. Proof photos stay private. Offline replay validates current ownership, versions and upload state rather than silently replacing newer server data. Integration and concurrency tests cover these rules, including reassignment and stale updates.')
    para('Docker Compose is the baseline deployment target. Kubernetes and the AI assistant are stretch features, not prerequisites. Online payments, route optimisation, physical return tracking and a future Parcels service split remain outside the current baseline.')
    end()

    start(40,'Appendix A: Contribution Sheet')
    para('Table 14 summarises the contribution areas and corresponding report sections for the ten-member team.')
    text('Table 14: Contribution sheet',style=CAP)
    table(['#','Member name','Reg. no.','Main responsibility','Report sections'],[
    ['1','','','Team lead, architecture, integration design','1, 5, 13'],
    ['2','','','Auth module: JWT, Google OAuth, RBAC','2, 7.4, 9.1-9.2'],
    ['3','','','Parcels module, state machine, tracking API','4, 7.5'],
    ['4','','','Pricing strategies, zones, quotes','7.1, 8'],
    ['5','','','Dispatch module, courier workload','3.4, 7.6'],
    ['6','','','Merchant API, client credentials, webhooks','3.2, 7.2, 7.7, 9.3'],
    ['7','','','RabbitMQ, outbox relay, notification service','6'],
    ['8','','','Frontend: customer portal, public tracking, real-time','3.1, 6.6'],
    ['9','','','Frontend: merchant, courier PWA, admin console','3.3, 10'],
    ['10','','','DevOps: Docker, Kubernetes, CI, testing and coverage','5.5, 11, 12']
    ],[24,86,60,209,CW-379],9.5);end()



def main():
    global C
    parser=argparse.ArgumentParser();parser.add_argument('--source',type=Path,default=ROOT/'SwiftDrop_Design_Report.pdf');parser.add_argument('--output',type=Path,default=ROOT/'output/pdf/SwiftDrop_Design_Report_Corrected.pdf');args=parser.parse_args()
    args.output.parent.mkdir(parents=True,exist_ok=True)
    buff=io.BytesIO();C=canvas.Canvas(buff,pagesize=(W,H));C.setTitle('SwiftDrop Design Documentation');C.setAuthor('SwiftDrop Group 23');C.setSubject('Parcel Delivery and Courier Management System - Group Assignment')
    build_pages();C.save();doc=fitz.open(stream=buff.getvalue(),filetype='pdf');original=fitz.open(args.source)
    assert len(doc)==40 and len(original)==41
    doc.set_toc([[1,'Contents',2],[1,'Introduction',5],[1,'Users and access',7],[1,'Use cases',8],[1,'Data design',13],[1,'Architecture',16],[1,'Integration',20],[1,'Key flows',24],[1,'Patterns',31],[1,'Security',33],[1,'API',35],[1,'Testing approach',37],[1,'Optional features',38],[1,'Conclusion',39],[1,'Contribution sheet',40]])
    # Replace page contents/resources directly: no scaling or rewriting of working pages.
    from pypdf import PdfReader, PdfWriter
    from pypdf.generic import NameObject
    revised=PdfReader(io.BytesIO(doc.tobytes(garbage=4,deflate=True)))
    old=PdfReader(args.source);writer=PdfWriter();writer.clone_document_from_reader(revised)
    for n in [9,27,31]:
        dest=writer.pages[n-1];src=old.pages[n-1]
        for key in ['/Contents','/Resources','/MediaBox','/CropBox','/Rotate','/Annots','/Group','/Tabs']:
            if key in src:dest[NameObject(key)]=src.raw_get(key).clone(writer)
            elif key in dest:del dest[key]
    assembled=io.BytesIO();writer.write(assembled)
    final=fitz.open(stream=assembled.getvalue(),filetype='pdf')
    # Include imported pages and embedded graphics in the monochrome conversion.
    for page in final:page.recolor(components=1)
    args.output.write_bytes(final.tobytes(garbage=4,deflate=True))
    final.close()
    doc.close();original.close()
    (ROOT/'tmp/pdfs').mkdir(parents=True,exist_ok=True)
    (ROOT/'tmp/pdfs/layout_bounds.json').write_text(json.dumps(bounds))
    print(f'Created {args.output} (40 monochrome pages; original pages 9, 27 and 31 retained)')

if __name__=='__main__':main()
