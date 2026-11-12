import './mode-corner-ribbon.css';

export function ModeCornerRibbon({ mode }: { mode: 'preview' }) {
    return <div className="mode-corner-ribbon" data-mode={mode} aria-label="Mode pratinjau">
        <span>PRATINJAU</span>
    </div>;
}
