import type { Locale, PageKey } from '../i18n';

export type EditorialSection = {
  sourceLabel: string;
  heading: string;
  lead: string;
  entries: readonly { title: string; body: string }[];
};

// All text in this module is original, generic educational or preview-status
// editorial copy. It is not supplier prose, a product specification, or a
// company-verified claim. Human technical and native-RO reviews are pending.
export const editorialContent: Record<Locale, Record<PageKey, EditorialSection>> = {
  en: {
    home: {
      sourceLabel: 'General education · editorial preview',
      heading: 'Start with the basics',
      lead: 'This presentation introduces the vocabulary used to explore miniature turbine systems. It does not identify a manufactured BODICH product.',
      entries: [
        { title: 'Air enters the system', body: 'A compressor raises incoming air pressure before combustion. The arrangement varies by engine design.' },
        { title: 'Energy travels through the core', body: 'Fuel and compressed air release energy in a combustion chamber. Hot gas drives a turbine and continues toward the exhaust.' },
        { title: 'Evidence comes first', body: 'Model compatibility, operating limits and service instructions require documentation for the exact equipment, not general descriptions.' },
      ],
    },
    products: {
      sourceLabel: 'General turbine education · no verified product listing',
      heading: 'How a miniature gas turbine works',
      lead: 'The following is an introductory description of a turbine cycle, not a BODICH model description or operating instruction.',
      entries: [
        { title: 'Compression', body: 'The compressor adds pressure to the incoming air. Compressor design affects the overall system but does not establish any specific product rating.' },
        { title: 'Combustion and expansion', body: 'Fuel releases heat in the combustor. Expanding gas powers a turbine that drives the compressor through a shaft.' },
        { title: 'Exhaust and integration', body: 'Gas leaving the turbine flows to an exhaust section. Safe installation needs the actual manufacturer documentation and equipment-specific checks.' },
      ],
    },
    accessories: {
      sourceLabel: 'General component education · not an inventory',
      heading: 'Understanding supporting systems',
      lead: 'Accessories can serve different roles in a turbine installation. The categories below are for orientation only.',
      entries: [
        { title: 'Control and sensing', body: 'Controllers use feedback from sensors to manage system states; exact behavior depends on the controller and engine.' },
        { title: 'Fuel and electrical paths', body: 'Fuel delivery and electrical power are separate subsystems. Components cannot be assumed interchangeable across models.' },
        { title: 'Mechanical installation', body: 'Mounting parts must be assessed against manufacturer instructions and the application. This preview makes no fitment claims.' },
      ],
    },
    support: {
      sourceLabel: 'General FAQ · not service or safety advice',
      heading: 'Frequently asked questions',
      lead: 'These answers explain the current information boundaries. Consult the manufacturer's approved manual and qualified support for any real installation.',
      entries: [
        { title: 'Can I download a BODICH operating manual?', body: 'Not from this preview. No model-specific manual or publication rights have been approved.' },
        { title: 'Do presentation illustrations prove product availability?', body: 'No. When shown in an authorized beta, illustrations are AI-generated; release-safe pages omit them. Neither case confirms a specific engine, test result or stock status.' },
        { title: 'Can I use these descriptions to install an engine?', body: 'No. Introductory explanations do not replace verified instructions, model-specific safety limits or qualified technical assessment.' },
      ],
    },
    about: {
      sourceLabel: 'Editorial process · company information pending',
      heading: 'What we verify before publishing',
      lead: 'BODICH is the identity of this website preview. The site does not yet validate a legal entity, manufacturing role or product supply relationship.',
      entries: [
        { title: 'Separate sources', body: 'Supplier references, general explanations, AI-generated visuals and company-owned product evidence must be labelled and evaluated separately.' },
        { title: 'Review each claim', body: 'Performance figures, certificates, warranty conditions and manufacturing statements need attributable records and human review.' },
        { title: 'Keep drafts private', body: 'Reference identifiers and unapproved catalog entries are held outside the public site and are not offered as products.' },
      ],
    },
    contact: {
      sourceLabel: 'Contact status · no live communication channel',
      heading: 'How contact details will be published',
      lead: 'An official channel is useful only when ownership, publication permission and monitoring responsibility are confirmed.',
      entries: [
        { title: 'Verify the destination', body: 'A business email address, phone number or office location must be authenticated before it appears here.' },
        { title: 'Explain the purpose', body: 'Future contact options will distinguish general questions from technical assistance and sales inquiries, if those services are approved.' },
        { title: 'Respect visitor data', body: 'No inquiry form, mailing list or visitor-message database operates on this preview.' },
      ],
    },
  },
  ro: {
    home: {
      sourceLabel: 'Informații generale · conținut editorial în previzualizare',
      heading: 'Noțiuni de bază',
      lead: 'Această prezentare explică termenii utilizați pentru sistemele de turbine miniaturale. Nu identifică un produs BODICH fabricat.',
      entries: [
        { title: 'Admisia aerului', body: 'Compresorul mărește presiunea aerului înainte de ardere. Configurația diferă în funcție de proiectarea motorului.' },
        { title: 'Transferul energiei', body: 'Combustibilul și aerul comprimat eliberează energie în camera de ardere. Gazele fierbinți antrenează turbina și continuă spre evacuare.' },
        { title: 'Documentația este esențială', body: 'Compatibilitatea, limitele de funcționare și întreținerea necesită documente specifice echipamentului, nu doar descrieri generale.' },
      ],
    },
    products: {
      sourceLabel: 'Informații tehnice generale · fără produse confirmate',
      heading: 'Cum funcționează o turbină cu gaze miniaturală',
      lead: 'Explicația de mai jos prezintă principiul general al ciclului, nu un model BODICH sau instrucțiuni de utilizare.',
      entries: [
        { title: 'Comprimarea', body: 'Compresorul crește presiunea aerului admis. Proiectarea sa influențează sistemul, fără să stabilească parametrii unui anumit produs.' },
        { title: 'Arderea și destinderea', body: 'Combustibilul eliberează căldură în camera de ardere. Gazele în destindere acționează turbina, care antrenează compresorul printr-un arbore.' },
        { title: 'Evacuarea și integrarea', body: 'Gazele trec din turbină spre evacuare. Montajul sigur necesită documentația producătorului real și verificări adaptate echipamentului.' },
      ],
    },
    accessories: {
      sourceLabel: 'Informații generale despre componente · nu reprezintă stocuri',
      heading: 'Rolul sistemelor auxiliare',
      lead: 'Accesoriile pot îndeplini funcții diferite într-o instalație cu turbină. Categoriile au exclusiv rol de orientare.',
      entries: [
        { title: 'Comandă și senzori', body: 'Controlerele utilizează semnale de la senzori pentru gestionarea stărilor sistemului; funcționarea exactă depinde de motor și controler.' },
        { title: 'Alimentare și electricitate', body: 'Alimentarea cu combustibil și cea electrică sunt subsisteme distincte. Componentele nu sunt automat compatibile între modele.' },
        { title: 'Montaj mecanic', body: 'Piesele de fixare trebuie evaluate potrivit instrucțiunilor producătorului și aplicației. Nu sunt confirmate compatibilități aici.' },
      ],
    },
    support: {
      sourceLabel: 'Întrebări frecvente generale · nu sunt instrucțiuni de service',
      heading: 'Întrebări frecvente',
      lead: 'Răspunsurile explică limitele informațiilor disponibile. Pentru un montaj real, consultă manualul aprobat al producătorului și cere sprijinul personalului calificat.',
      entries: [
        { title: 'Pot descărca un manual de utilizare BODICH?', body: 'Nu din această previzualizare. Niciun manual specific unui model și niciun drept de publicare nu au fost aprobate.' },
        { title: 'Ilustrațiile de prezentare confirmă disponibilitatea produselor?', body: 'Nu. În versiunea beta autorizată, ilustrațiile sunt generate cu IA; în versiunea publică sigură nu sunt afișate. Niciuna dintre versiuni nu confirmă identitatea, testarea sau disponibilitatea unui motor.' },
        { title: 'Pot instala un motor folosind aceste explicații?', body: 'Nu. Explicațiile introductive nu înlocuiesc instrucțiunile verificate, limitele de siguranță ale modelului și evaluarea tehnică specializată.' },
      ],
    },
    about: {
      sourceLabel: 'Proces editorial · informații despre companie în așteptare',
      heading: 'Ce verificăm înainte de publicare',
      lead: 'BODICH reprezintă identitatea acestei prezentări. Site-ul nu confirmă încă entitatea juridică, rolul de producător sau relațiile comerciale.',
      entries: [
        { title: 'Separarea surselor', body: 'Referințele furnizorilor, explicațiile generale, imaginile generate cu IA și dovezile despre produse trebuie etichetate și evaluate separat.' },
        { title: 'Verificarea afirmațiilor', body: 'Valorile de performanță, certificările, garanțiile și afirmațiile despre fabricație au nevoie de dovezi și aprobare umană.' },
        { title: 'Păstrarea ciornelor', body: 'Identificatorii de referință și înregistrările de catalog neaprobate rămân în afara site-ului public.' },
      ],
    },
    contact: {
      sourceLabel: 'Stadiul datelor de contact · fără canal activ',
      heading: 'Cum vor apărea datele de contact',
      lead: 'Un canal oficial este util numai după confirmarea titularului, a permisiunii de publicare și a responsabilității de administrare.',
      entries: [
        { title: 'Verificarea datelor', body: 'Adresa profesională de e-mail, telefonul sau sediul trebuie autentificate înainte de publicare.' },
        { title: 'Clarificarea scopului', body: 'Canalele viitoare vor diferenția întrebările generale de asistența tehnică și solicitările comerciale, dacă aceste servicii vor fi aprobate.' },
        { title: 'Protejarea datelor', body: 'Această previzualizare nu conține formulare de contact, liste de corespondență sau baze de date cu mesaje.' },
      ],
    },
  },
};
