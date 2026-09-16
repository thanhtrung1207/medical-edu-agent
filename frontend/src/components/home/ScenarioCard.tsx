'use client';
import Link from 'next/link';

interface ScenarioCardProps {
  href: string;
  icon: string; // emoji
  title: string;
  description: string;
  tags: string[]; // option tags like ["Composite · Inlay · Onlay", "Mão răng", ...]
}

export default function ScenarioCard({
  href,
  icon,
  title,
  description,
  tags,
}: ScenarioCardProps) {
  return (
    <Link
      href={href}
      className="group block w-full max-w-[340px] bg-white rounded-2xl p-7 cursor-pointer border-2 border-borderSoft transition-all hover:shadow-lg hover:shadow-primary/20 hover:-translate-y-1 hover:border-primary"
    >
      <div className="w-14 h-14 bg-cream rounded-2xl flex items-center justify-center text-3xl mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-bold text-slate-800 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 leading-relaxed mb-4">{description}</p>
      <ul className="space-y-2 mb-5">
        {tags.map((tag, idx) => (
          <li
            key={idx}
            className="flex items-center gap-2 text-xs text-slate-600"
          >
            <span className="w-1.5 h-1.5 bg-primary rounded-full shrink-0" />
            {tag}
          </li>
        ))}
      </ul>
      <div className="bg-primary text-white py-2.5 px-4 rounded-lg text-center text-sm font-semibold transition-colors group-hover:bg-primary-600">
        Bắt đầu phân tích
      </div>
    </Link>
  );
}
