import React, { useEffect, useMemo, useState } from "react";

// --- Quick setup notes -------------------------------------------------------
// 1) Replace WHATSAPP_NUMBER with your WhatsApp number in international format (no +).
//    Example: Colombia mobile 3001112233 => "573001112233" (57 = country code)
// 2) Optional: Replace BRAND with your chosen brand/domain.
// 3) This is a single-file React component with Tailwind classes. Drop into Vite/CRA.
// 4) No external UI libs required.

const WHATSAPP_NUMBER = "573001112233"; // TODO: set to real number
const BRAND = "MedellínLink"; // or "MedellinLink" if you prefer no accent

export default function MedellinLinkSite() {
  const [lang, setLang] = useState("en");
  const L = useMemo(() => (lang === "es" ? es : en), [lang]);

  useEffect(() => {
    // Simple scroll-reveal
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) e.target.classList.add("reveal-in");
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 }
    );

    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  const openWhatsApp = (prefill = "") => {
    const msg = encodeURIComponent(prefill || L.whatsappPrefill);
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const NavLink = ({ href, children }) => (
    <a
      href={href}
      className="px-3 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 rounded-lg"
    >
      {children}
    </a>
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-slate-50 text-slate-900">
      <SiteStyle />

      {/* NAVBAR */}
      <header className="sticky top-0 z-40 backdrop-blur bg-white/80 border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-3 flex items-center justify-between">
          <a href="#home" className="flex items-center gap-2 group">
            <Logo className="h-7 w-7" />
            <span className="font-bold tracking-tight text-lg group-hover:opacity-90">{BRAND}</span>
          </a>
          <nav className="hidden md:flex items-center">
            <NavLink href="#services">{L.nav.services}</NavLink>
            <NavLink href="#how">{L.nav.how}</NavLink>
            <NavLink href="#cities">{L.nav.cities}</NavLink>
            <NavLink href="#pricing">{L.nav.pricing}</NavLink>
            <NavLink href="#faq">{L.nav.faq}</NavLink>
            <NavLink href="#contact">{L.nav.contact}</NavLink>
          </nav>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setLang((p) => (p === "en" ? "es" : "en"))}
              className="hidden sm:inline-flex text-sm px-3 py-2 rounded-xl border border-slate-300 hover:border-emerald-400 hover:text-emerald-700"
              aria-label="Toggle language"
            >
              {lang === "en" ? "ES" : "EN"}
            </button>
            <button
              onClick={() => openWhatsApp()}
              className="inline-flex items-center gap-2 text-sm px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 shadow"
            >
              <WhatsAppIcon className="h-4 w-4" /> {L.cta.whatsapp}
            </button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section id="home" className="relative overflow-hidden">
        <BackgroundGrid />
        <div className="mx-auto max-w-6xl px-4 py-16 md:py-24 grid md:grid-cols-2 gap-10 items-center">
          <div data-reveal className="translate-y-6 opacity-0">
            <h1 className="text-3xl md:text-5xl font-black tracking-tight leading-tight">
              {L.hero.title}
            </h1>
            <p className="mt-4 text-lg text-slate-700">
              {L.hero.sub}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                onClick={() => openWhatsApp()}
                className="inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700 shadow-md"
              >
                <WhatsAppIcon className="h-5 w-5" /> {L.cta.whatsapp}
              </button>
              <a
                href="#services"
                className="px-5 py-3 rounded-2xl border border-slate-300 hover:border-slate-400"
              >
                {L.cta.learn}
              </a>
            </div>
            <div className="mt-6 flex flex-wrap gap-2 text-sm text-slate-600">
              <Badge>{L.hero.badges.bilingual}</Badge>
              <Badge>{L.hero.badges.local}</Badge>
              <Badge>{L.hero.badges.transparent}</Badge>
              <Badge>{L.hero.badges.womenLed}</Badge>
            </div>
            <p className="mt-6 text-xs text-slate-500">{L.disclaimer}</p>
          </div>
          <div data-reveal className="translate-y-6 opacity-0">
            <HeroCard lang={lang} />
          </div>
        </div>
      </section>

      {/* SERVICES */}
      <section id="services" className="mx-auto max-w-6xl px-4 py-16">
        <h2 data-reveal className="translate-y-6 opacity-0 text-2xl md:text-4xl font-extrabold tracking-tight">
          {L.services.title}
        </h2>
        <p data-reveal className="translate-y-6 opacity-0 mt-2 text-slate-700 max-w-2xl">
          {L.services.sub}
        </p>
        <div className="mt-8 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {serviceList(L).map((s, i) => (
            <ServiceCard key={i} {...s} />
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="how" className="bg-white border-y border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 data-reveal className="translate-y-6 opacity-0 text-2xl md:text-4xl font-extrabold tracking-tight">
            {L.how.title}
          </h2>
          <ol className="mt-8 grid md:grid-cols-3 gap-6">
            {L.how.steps.map((step, i) => (
              <li
                key={i}
                data-reveal
                className="translate-y-6 opacity-0 bg-slate-50 rounded-2xl border border-slate-200 p-6 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <span className="h-9 w-9 inline-flex items-center justify-center rounded-xl bg-emerald-100 font-bold text-emerald-700">
                    {i + 1}
                  </span>
                  <h3 className="text-lg font-bold">{step.title}</h3>
                </div>
                <p className="mt-3 text-slate-700">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CITIES */}
      <section id="cities" className="mx-auto max-w-6xl px-4 py-16">
        <h2 data-reveal className="translate-y-6 opacity-0 text-2xl md:text-4xl font-extrabold tracking-tight">
          {L.cities.title}
        </h2>
        <p className="mt-2 text-slate-700 max-w-2xl" data-reveal>
          {L.cities.sub}
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          {L.cities.list.map((c, i) => (
            <span key={i} className="px-4 py-2 rounded-2xl border border-slate-300 bg-white shadow-sm" data-reveal>
              {c}
            </span>
          ))}
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="bg-white border-y border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <h2 data-reveal className="translate-y-6 opacity-0 text-2xl md:text-4xl font-extrabold tracking-tight">
            {L.pricing.title}
          </h2>
          <p className="mt-2 text-slate-700 max-w-2xl" data-reveal>
            {L.pricing.sub}
          </p>
          <div className="mt-8 grid md:grid-cols-3 gap-6">
            {L.pricing.plans.map((p, i) => (
              <PricingCard key={i} {...p} onClick={() => openWhatsApp(p.prefill)} />
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="mx-auto max-w-6xl px-4 py-16">
        <h2 data-reveal className="translate-y-6 opacity-0 text-2xl md:text-4xl font-extrabold tracking-tight">
          {L.faq.title}
        </h2>
        <div className="mt-6 grid md:grid-cols-2 gap-6">
          {L.faq.qas.map((qa, i) => (
            <details key={i} className="group border border-slate-200 rounded-2xl p-5 bg-white shadow-sm" data-reveal>
              <summary className="cursor-pointer list-none flex items-center justify-between font-semibold">
                {qa.q}
                <span className="ml-4 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-300 text-slate-500 group-open:rotate-45 transition">
                  +
                </span>
              </summary>
              <p className="mt-3 text-slate-700">{qa.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CONTACT */}
      <section id="contact" className="bg-white border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-16">
          <div className="grid md:grid-cols-2 gap-10 items-start">
            <div data-reveal className="translate-y-6 opacity-0">
              <h2 className="text-2xl md:text-4xl font-extrabold tracking-tight">{L.contact.title}</h2>
              <p className="mt-2 text-slate-700 max-w-prose">{L.contact.sub}</p>
              <div className="mt-6 space-y-3 text-sm">
                <div className="flex items-center gap-2"><WhatsAppIcon className="h-4 w-4" /><button onClick={() => openWhatsApp()} className="underline underline-offset-4 decoration-emerald-500 hover:text-emerald-700">{L.contact.whatsapp}</button></div>
                <div className="flex items-center gap-2"><PhoneIcon className="h-4 w-4" /><span>{L.contact.phoneLabel}: <a className="hover:underline" href={`tel:+${WHATSAPP_NUMBER}`}>+{WHATSAPP_NUMBER}</a></span></div>
                <div className="flex items-center gap-2"><MailIcon className="h-4 w-4" /><a className="hover:underline" href="mailto:hello@medellin.link">hello@medellin.link</a></div>
              </div>
              <p className="mt-6 text-xs text-slate-500">{L.disclaimer}</p>
            </div>
            <ContactForm L={L} openWhatsApp={openWhatsApp} />
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-10 text-sm flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 opacity-80"><Logo className="h-5 w-5" /><span>{BRAND}</span></div>
          <p className="text-slate-500">© {new Date().getFullYear()} {BRAND}. {L.footer.rights}</p>
          <div className="flex items-center gap-4 text-slate-500">
            <a href="#privacy" className="hover:text-slate-800">{L.footer.privacy}</a>
            <a href="#terms" className="hover:text-slate-800">{L.footer.terms}</a>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp */}
      <button
        onClick={() => openWhatsApp()}
        aria-label="WhatsApp"
        className="fixed bottom-5 right-5 md:bottom-6 md:right-6 h-12 w-12 rounded-full shadow-lg bg-emerald-600 hover:bg-emerald-700 text-white grid place-items-center"
      >
        <WhatsAppIcon className="h-5 w-5" />
      </button>
    </div>
  );
}

// ---------------------------- Content (EN/ES) -------------------------------
const en = {
  nav: { services: "Services", how: "How It Works", cities: "Cities", pricing: "Pricing", faq: "FAQ", contact: "Contact" },
  cta: { whatsapp: "WhatsApp Now", learn: "See services" },
  hero: {
    title: "Local help in Medellín—reliable doctors, health tourism, and translation.",
    sub: "We specialize in medical navigation and health tourism. We can also handle airport pickup, translation, visa assistance, tours, and safe travel.",
    badges: {
      bilingual: "Bilingual (ES/EN)",
      local: "Local expertise",
      transparent: "Transparent pricing",
      womenLed: "Women-led"
    }
  },
  services: {
    title: "What we do",
    sub: "End-to-end support for visitors and expats. We are not a healthcare provider; we connect you with trusted clinics and accompany you throughout the process.",
  },
  how: {
    title: "How it works",
    steps: [
      { title: "Tell us what you need", body: "Share your dates, language, and what you’re looking for (doctor specialty, tour, paperwork)." },
      { title: "We propose options", body: "We send vetted clinics/providers, times, and costs. You pick what fits." },
      { title: "We guide you end-to-end", body: "Scheduling, forms, in-person translation, transportation, and follow-ups." },
    ],
  },
  cities: {
    title: "Where we operate",
    sub: "Headquartered in Medellín. We can also support you in other Colombian cities upon request.",
    list: ["Medellín (primary)", "Bogotá", "Cartagena"],
  },
  pricing: {
    title: "Simple packages",
    sub: "Transparent starting points—message us on WhatsApp for a custom quote.",
    plans: [
      {
        name: "Starter",
        price: "from $79",
        features: ["15-min consult", "Shortlist of clinics/providers", "WhatsApp support (business hours)"],
        cta: "Book Starter",
        prefill: "Hi! I'm interested in the Starter package. My dates are … and I need help with …",
      },
      {
        name: "Plus",
        price: "from $199",
        features: ["All Starter", "Scheduling + form help", "In-person translation up to 3h"],
        cta: "Book Plus",
        prefill: "Hi! I'd like the Plus package (scheduling + translation). My dates are … and I need …",
      },
      {
        name: "Concierge",
        price: "from $399",
        features: ["All Plus", "Door-to-door escort", "Next-day follow-up"],
        cta: "Book Concierge",
        prefill: "Hi! I'm interested in Concierge. Please help me with door-to-door escort and follow-up.",
      },
    ],
  },
  faq: {
    title: "FAQ",
    qas: [
      { q: "Are you a medical provider?", a: "No. We are a local concierge/guide service. We help you navigate options, schedule, translate, and accompany you." },
      { q: "Do clinics speak English?", a: "We prioritize English-friendly doctors. We also provide translation in-person and over the phone." },
      { q: "Can you help with visas?", a: "Yes—guidance on the process and paperwork. We are not an immigration law firm." },
      { q: "Airport pickup?", a: "Yes—safe transportation from José María Córdova (MDE) or Olaya Herrera (EOH)." },
      { q: "Emergency support?", a: "For emergencies in Colombia, call 123. We do not provide emergency medical care." },
    ],
  },
  contact: {
    title: "Talk to a real local",
    sub: "Tell us your dates, city, and what you need. We'll reply quickly on WhatsApp.",
    whatsapp: "Open WhatsApp chat",
    phoneLabel: "Call",
    form: {
      name: "Name",
      email: "Email",
      dates: "Dates",
      city: "City",
      need: "What do you need?",
      send: "Send via WhatsApp",
    },
  },
  disclaimer: "We are not a healthcare provider and do not offer medical advice. For emergencies in Colombia, call 123.",
  footer: { rights: "All rights reserved.", privacy: "Privacy", terms: "Terms" },
  whatsappPrefill: "Hi! I found you on MedellínLink. I need help with doctors/translation/travel in Medellín.",
};

const es = {
  nav: { services: "Servicios", how: "Cómo funciona", cities: "Ciudades", pricing: "Precios", faq: "FAQ", contact: "Contacto" },
  cta: { whatsapp: "WhatsApp ahora", learn: "Ver servicios" },
  hero: {
    title: "Ayuda local en Medellín: doctores confiables, turismo de salud y traducción.",
    sub: "Especialistas en navegación médica y turismo de salud. También hacemos recogida en el aeropuerto, traducción, asesoría de visado, tours y viaje seguro.",
    badges: {
      bilingual: "Bilingüe (ES/EN)",
      local: "Experiencia local",
      transparent: "Precios transparentes",
      womenLed: "Liderado por mujeres"
    }
  },
  services: {
    title: "Qué hacemos",
    sub: "Acompañamiento integral para visitantes y expatriados. No somos un proveedor de salud; te conectamos con clínicas confiables y te acompañamos en todo el proceso.",
  },
  how: {
    title: "Cómo funciona",
    steps: [
      { title: "Cuéntanos qué necesitas", body: "Comparte tus fechas, idioma y lo que buscas (especialidad médica, tour, trámites)." },
      { title: "Te proponemos opciones", body: "Enviamos clínicas/proveedores verificados, horarios y costos. Tú eliges." },
      { title: "Te guiamos de principio a fin", body: "Agenda, formularios, traducción presencial, transporte y seguimiento." },
    ],
  },
  cities: {
    title: "Dónde operamos",
    sub: "Base en Medellín. También podemos apoyarte en otras ciudades de Colombia bajo solicitud.",
    list: ["Medellín (principal)", "Bogotá", "Cartagena"],
  },
  pricing: {
    title: "Paquetes simples",
    sub: "Puntos de partida transparentes—escríbenos por WhatsApp para una cotización a medida.",
    plans: [
      {
        name: "Inicial",
        price: "desde $79",
        features: ["Consulta de 15 min", "Lista corta de clínicas/proveedores", "Soporte por WhatsApp (horario laboral)"] ,
        cta: "Elegir Inicial",
        prefill: "¡Hola! Me interesa el paquete Inicial. Mis fechas son … y necesito ayuda con …",
      },
      {
        name: "Plus",
        price: "desde $199",
        features: ["Todo Inicial", "Agendamiento + ayuda con formularios", "Traducción presencial hasta 3h"],
        cta: "Elegir Plus",
        prefill: "¡Hola! Quiero el paquete Plus (agendamiento + traducción). Mis fechas son … y necesito …",
      },
      {
        name: "Conserje",
        price: "desde $399",
        features: ["Todo Plus", "Acompañamiento puerta a puerta", "Seguimiento al día siguiente"],
        cta: "Elegir Conserje",
        prefill: "¡Hola! Me interesa Conserje. Por favor ayúdenme con acompañamiento puerta a puerta y seguimiento.",
      },
    ],
  },
  faq: {
    title: "Preguntas frecuentes",
    qas: [
      { q: "¿Son un proveedor médico?", a: "No. Somos un servicio local de concierge/guía. Te ayudamos a navegar opciones, agendar, traducir y acompañar." },
      { q: "¿Las clínicas hablan inglés?", a: "Priorizamos doctores con inglés. Además brindamos traducción presencial y telefónica." },
      { q: "¿Pueden ayudar con visas?", a: "Sí—orientación sobre el proceso y documentos. No somos una firma de inmigración." },
      { q: "¿Recogida en aeropuerto?", a: "Sí—transporte seguro desde José María Córdova (MDE) u Olaya Herrera (EOH)." },
      { q: "¿Soporte en emergencias?", a: "Para emergencias en Colombia, llama al 123. No brindamos atención médica de emergencia." },
    ],
  },
  contact: {
    title: "Habla con una local",
    sub: "Cuéntanos tus fechas, ciudad y necesidad. Respondemos rápido por WhatsApp.",
    whatsapp: "Abrir WhatsApp",
    phoneLabel: "Llamar",
    form: {
      name: "Nombre",
      email: "Correo",
      dates: "Fechas",
      city: "Ciudad",
      need: "¿Qué necesitas?",
      send: "Enviar por WhatsApp",
    },
  },
  disclaimer: "No somos un proveedor de salud ni damos consejo médico. Para emergencias en Colombia, llama al 123.",
  footer: { rights: "Todos los derechos reservados.", privacy: "Privacidad", terms: "Términos" },
  whatsappPrefill: "¡Hola! Los encontré en MedellínLink. Necesito ayuda con doctores/traducción/viaje en Medellín.",
};

// ---------------------------- Components ------------------------------------
function SiteStyle() {
  return (
    <style>{`
      /* slide-in reveal */
      [data-reveal] { transition: transform .7s ease, opacity .7s ease; }
      .reveal-in { transform: translateY(0) !important; opacity: 1 !important; }
      [data-reveal]:not(.reveal-in) { transform: translateY(12px); opacity: 0; }
    `}</style>
  );
}

function BackgroundGrid() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute inset-0 bg-[radial-gradient(1000px_500px_at_80%_-20%,rgba(16,185,129,.15),transparent),radial-gradient(800px_400px_at_0%_120%,rgba(59,130,246,.12),transparent)]" />
      <svg className="absolute inset-0 w-full h-full opacity-[0.06]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="grid" width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>
    </div>
  );
}

function Logo({ className = "h-6 w-6" }) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#10b981" />
          <stop offset="100%" stopColor="#3b82f6" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" fill="url(#g)" opacity="0.2" />
      <path d="M6 12h12M12 6v12" stroke="#10b981" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Badge({ children }) {
  return (
    <span className="px-3 py-1 rounded-full border border-slate-300 bg-white text-xs shadow-sm">
      {children}
    </span>
  );
}

function ServiceCard({ icon: Icon, title, body, primary }) {
  return (
    <article
      data-reveal
      className={`translate-y-6 opacity-0 rounded-2xl border p-6 shadow-sm bg-white ${
        primary ? "border-emerald-300" : "border-slate-200"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className={`h-10 w-10 grid place-items-center rounded-xl ${
          primary ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-700"
        }`}>
          <Icon className="h-5 w-5" />
        </span>
        <h3 className="text-lg font-bold">{title}</h3>
      </div>
      <p className="mt-3 text-slate-700">{body}</p>
    </article>
  );
}

function PricingCard({ name, price, features, cta, prefill, onClick }) {
  return (
    <article data-reveal className="translate-y-6 opacity-0 rounded-2xl border border-slate-200 p-6 bg-white shadow-sm flex flex-col">
      <h3 className="text-xl font-extrabold">{name}</h3>
      <div className="mt-2 text-3xl font-black tracking-tight">{price}</div>
      <ul className="mt-4 space-y-2 text-slate-700">
        {features.map((f, i) => (
          <li key={i} className="flex items-start gap-2">
            <CheckIcon className="mt-1 h-4 w-4 text-emerald-600" /> <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={() => onClick(prefill)}
        className="mt-6 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700"
      >
        <WhatsAppIcon className="h-4 w-4" /> {cta}
      </button>
    </article>
  );
}

function ContactForm({ L, openWhatsApp }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [dates, setDates] = useState("");
  const [city, setCity] = useState("Medellín");
  const [need, setNeed] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    const text = `${L.contact.form.name}: ${name}\n${L.contact.form.email}: ${email}\n${L.contact.form.dates}: ${dates}\n${L.contact.form.city}: ${city}\n${L.contact.form.need}: ${need}`;
    openWhatsApp(text);
  };

  return (
    <form onSubmit={handleSubmit} className="translate-y-6 opacity-0" data-reveal>
      <div className="grid grid-cols-1 gap-4">
        <label className="block">
          <span className="text-sm font-medium">{L.contact.form.name}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{L.contact.form.email}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{L.contact.form.dates}</span>
          <input value={dates} onChange={(e) => setDates(e.target.value)} placeholder="2025-11-02 → 2025-11-07" className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{L.contact.form.city}</span>
          <input value={city} onChange={(e) => setCity(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
        </label>
        <label className="block">
          <span className="text-sm font-medium">{L.contact.form.need}</span>
          <textarea value={need} onChange={(e) => setNeed(e.target.value)} rows={5} className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2" />
        </label>
        <button type="submit" className="mt-2 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-emerald-600 text-white hover:bg-emerald-700">
          <WhatsAppIcon className="h-5 w-5" /> {L.contact.form.send}
        </button>
      </div>
    </form>
  );
}

function HeroCard({ lang }) {
  const items = [
    { icon: StethoscopeIcon, en: "Trusted doctors", es: "Doctores confiables" },
    { icon: TranslateIcon, en: "Translation on-site", es: "Traducción presencial" },
    { icon: PlaneIcon, en: "Airport pickup", es: "Recogida en aeropuerto" },
    { icon: ShieldIcon, en: "Safe travel routes", es: "Rutas seguras" },
    { icon: VisaIcon, en: "Visa guidance", es: "Asesoría de visado" },
  ];
  return (
    <div className="bg-white/70 backdrop-blur rounded-3xl border border-slate-200 p-6 md:p-8 shadow-lg">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {items.map((it, i) => (
          <div key={i} className="flex items-center gap-3 p-3 rounded-2xl border border-slate-200 bg-white">
            <it.icon className="h-5 w-5 text-emerald-600" />
            <span className="text-sm font-medium">{lang === "en" ? it.en : it.es}</span>
          </div>
        ))}
      </div>
      <div className="mt-6 text-sm text-slate-600">
        <p>{lang === "en" ? "Health tourism focus. Also tours, translation, visas, and safe travel." : "Enfoque en turismo de salud. También tours, traducción, visas y viaje seguro."}</p>
      </div>
    </div>
  );
}

// ------------------------------ Icons ---------------------------------------
function WhatsAppIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M.5 11.8C.5 5.9 5.3 1.1 11.2 1.1c5.9 0 10.7 4.8 10.7 10.7 0 5.9-4.8 10.7-10.7 10.7-1.9 0-3.6-.5-5.1-1.3L3 23.1l1.1-3c-1.1-1.7-1.8-3.7-1.8-5.8Zm3.1 0c0 1.9.7 3.6 1.8 5l.3.4-.6 1.8 1.9-.6.4.2c1.3.8 2.8 1.2 4.3 1.2 4.7 0 8.5-3.8 8.5-8.5S15.8 3.3 11.1 3.3s-8.5 3.8-8.5 8.5Zm5.3-1.9c.1-.3.2-.6.6-.7.2-.1.4-.1.7 0 .2 0 .5.1.7.5.3.7.7 1.4 1.1 2 .4.6.9 1.1 1.5 1.6.3.2.5.4.8.5.2.1.4.1.7 0 .2-.1.4-.3.6-.5.2-.2.3-.3.5-.3h.4c.2 0 .4 0 .6.3.2.3.7.7.7.9 0 .2.1.5 0 .7 0 .2-.2.5-.4.7-.2.3-.7.7-1.3.7-.3 0-.8.1-2.6-.7-1.5-.7-2.5-2-2.6-2.1-.1-.1-.6-.8-.6-1.5 0-.7.4-1.1.5-1.2Z" />
    </svg>
  );
}

function CheckIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StethoscopeIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M6 3v6a4 4 0 1 0 8 0V3M6 10a6 6 0 0 0 12 0m-2 9a3 3 0 0 1-6 0v-3m6 3a3 3 0 0 0 3-3v-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TranslateIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M4 5h16M4 5l6 6m0 0-4 8m4-8 4 8M20 5l-6 6m0 0 4 8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function PlaneIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M10 21l2-5 7.5-7.5a2.1 2.1 0 1 0-3-3L9 13l-5 2 2-5 8.5-8.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ShieldIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M12 3l7 4v5a8 8 0 0 1-7 8 8 8 0 0 1-7-8V7l7-4Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VisaIcon({ className = "h-5 w-5" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M3 6h18v12H3z" />
      <path d="M6 9h6M6 12h9M6 15h4" />
    </svg>
  );
}

function PhoneIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07A19.5 19.5 0 0 1 3.1 11.8 19.8 19.8 0 0 1 .03 3.18 2 2 0 0 1 2 1h3a2 2 0 0 1 2 1.72c.12.9.33 1.77.62 2.61a2 2 0 0 1-.45 2.11L6 8a16 16 0 0 0 10 10l.54-1.17a2 2 0 0 1 2.11-.45c.84.29 1.71.5 2.61.62A2 2 0 0 1 22 16.92Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MailIcon({ className = "h-4 w-4" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path d="M4 6h16v12H4z" />
      <path d="M4 7l8 6 8-6" />
    </svg>
  );
}

// -------------------------- Service Data ------------------------------------
function serviceList(L) {
  return [
    {
      icon: StethoscopeIcon,
      title: L.nav.services + ": " + (L === en ? "Health tourism & medical navigation" : "Turismo de salud y navegación médica"),
      body: L === en
        ? "Find English-friendly, trusted doctors. We schedule, translate, and accompany."
        : "Encuentra doctores confiables con inglés. Agendamos, traducimos y te acompañamos.",
      primary: true,
    },
    {
      icon: TranslateIcon,
      title: L === en ? "Translation & paperwork" : "Traducción y trámites",
      body: L === en
        ? "Clinic visits, pharmacy runs, insurance calls, and forms—without the stress."
        : "Clínicas, farmacia, llamadas a seguros y formularios—sin estrés.",
    },
    {
      icon: PlaneIcon,
      title: L === en ? "Airport pickup & transfers" : "Recogida en aeropuerto y traslados",
      body: L === en
        ? "Safe drivers for MDE/EOH. We coordinate timing with your itinerary."
        : "Conductores seguros para MDE/EOH. Coordinamos horarios con tu itinerario.",
    },
    {
      icon: VisaIcon,
      title: L === en ? "Visa guidance" : "Asesoría de visado",
      body: L === en
        ? "Step-by-step guidance and document checklists. (Not an immigration law firm.)"
        : "Guía paso a paso y lista de documentos. (No somos firma de inmigración.)",
    },
    {
      icon: ShieldIcon,
      title: L === en ? "Safe travel & tours" : "Viaje seguro y tours",
      body: L === en
        ? "Neighborhood orientation, safe routes, food spots, and local tips."
        : "Orientación de barrios, rutas seguras, comida y tips locales.",
    },
  ];
}
