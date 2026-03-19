import { Link } from 'react-router-dom';
import { AnkiPlusLogo } from './AnkiPlusLogo';

interface PageNavProps {
  rightContent?: React.ReactNode;
}

export function PageNav({ rightContent }: PageNavProps) {
  return (
    <nav className="flex justify-between items-center mb-12 md:mb-16">
      <AnkiPlusLogo />
      <div className="flex items-center gap-4">
        {rightContent || (
          <Link to="/" className="text-[13px] text-white/[0.35] font-light hover:text-white/[0.55] transition-colors">
            Startseite
          </Link>
        )}
      </div>
    </nav>
  );
}
