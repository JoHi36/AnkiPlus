import { Link } from 'react-router-dom';

interface AnkiPlusLogoProps {
  showPro?: boolean;
  size?: 'sm' | 'md' | 'lg';
  linkTo?: string;
}

export function AnkiPlusLogo({ showPro = false, size = 'md', linkTo = '/' }: AnkiPlusLogoProps) {
  const fontSize = size === 'sm' ? 'text-lg' : size === 'lg' ? 'text-2xl' : 'text-xl';

  return (
    <Link to={linkTo} className={`${fontSize} font-bold tracking-[-0.03em] inline-flex items-center`}>
      <span className="text-white">Anki</span><span className="text-[#0a84ff]">.plus</span>
      {showPro && (
        <span className="text-[11px] font-medium text-white/40 border border-white/10 rounded-md px-2 py-0.5 ml-1">
          Pro
        </span>
      )}
    </Link>
  );
}
