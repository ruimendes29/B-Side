import type { Settings } from '../types';
import type { UpdateSettings } from '../hooks/useSettings';
import type { SetStatus } from '../hooks/useStatus';
import { Logo } from './icons';
import { CategoriesPanel } from './settings/CategoriesPanel';
import { SongsPanel } from './settings/SongsPanel';
import { FamePanel } from './settings/FamePanel';
import { ArtistsPanel } from './settings/ArtistsPanel';
import { LanguagesPanel } from './settings/LanguagesPanel';
import { ClipPanel } from './settings/ClipPanel';
import { BlockedPanel } from './settings/BlockedPanel';

interface Props {
  settings: Settings;
  update: UpdateSettings;
  setStatus: SetStatus;
  onBlock: (name: string) => boolean;
  onUnblock: (name: string) => void;
}

export function Sidebar({ settings, update, setStatus, onBlock, onUnblock }: Props) {
  return (
    <aside className="sidebar" aria-label="Definições">
      <div className="brand"><Logo /><span>B-<b>Side</b></span></div>
      <CategoriesPanel settings={settings} update={update} />
      <SongsPanel settings={settings} update={update} setStatus={setStatus} />
      {settings.mode !== 'playlists' && <FamePanel settings={settings} update={update} />}
      {settings.mode === 'artists' && <ArtistsPanel settings={settings} update={update} setStatus={setStatus} />}
      {settings.mode === 'decades' && <LanguagesPanel settings={settings} update={update} />}
      <ClipPanel settings={settings} update={update} />
      <BlockedPanel blocked={settings.blockedArtists} onBlock={onBlock} onUnblock={onUnblock} />
    </aside>
  );
}
