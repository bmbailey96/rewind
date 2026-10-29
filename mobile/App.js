import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator, Alert, FlatList, Image, KeyboardAvoidingView, Linking,
  Modal, Platform, Pressable, ScrollView, StatusBar, StyleSheet, Text,
  TextInput, View
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { allFilms, toggleFilm, updateNote, importBackup, exportBackup, stats } from './src/db';
const { availability, candidateFilms, discoverPick, score } = require('./src/core');

const C = {
  bg: '#101b18', panel: '#1a2924', line: '#344c42', muted: '#95ac9f',
  text: '#eef2e7', accent: '#bde4a3', gold: '#e8c28b', red: '#f18c7c', black: '#101b18'
};
const TABS = ['LIBRARY', 'DISCOVER', 'SETTINGS'];
function Label({ children, color = C.muted, style }) {
  return <Text style={[styles.label, { color }, style]}>{children}</Text>;
}
function Action({ title, onPress, secondary = false, disabled = false, style }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={title}
    disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.action, secondary && styles.actionSecondary,
      disabled && { opacity: 0.42 }, pressed && { opacity: 0.67 }, style]}>
    <Text style={[styles.actionText, secondary && { color: C.text }]}>{title}</Text>
  </Pressable>;
}
function Poster({ film, wide = false }) {
  const [broken, setBroken] = useState(false);
  const src = film?.poster_path;
  const uri = src && !broken ? 'https://image.tmdb.org/t/p/w342' + src : null;
  return (
    <View style={[styles.poster, wide && styles.posterWide]}>
      {uri ? <Image source={{ uri }} onError={() => setBroken(true)}
        resizeMode="cover" style={styles.posterImage} accessibilityLabel={'Poster for ' + film.title} /> :
        <Text style={styles.posterFallback}>REWIND{'\n'}✳</Text>}
    </View>
  );
}
function FilmCard({ film, onOpen, onPin }) {
  const info = availability(film);
  return (
    <Pressable onPress={() => onOpen(film)} accessibilityRole="button"
      accessibilityLabel={'Details for ' + film.title}
      style={({ pressed }) => [styles.film, pressed && { opacity: 0.75 }]}>
      <Poster film={film} />
      <View style={styles.filmMain}>
        <Label color={C.gold} style={{ marginBottom: 7 }}>
          {(film.media_type === 'tv' ? 'TV SERIES' : 'FILM') + (film.year ? ' · ' + film.year : '')}
        </Label>
        <Text style={styles.filmTitle} numberOfLines={2}>{film.title}</Text>
        <Label style={{ marginTop: 8 }} color={info.verified ? C.accent : C.muted}>
          {info.label}
        </Label>
        <View style={styles.filmActions}>
          <Pressable onPress={(event) => { event.stopPropagation(); onPin(film); }}
            accessibilityRole="button" accessibilityLabel={(film.pinned ? 'Unpin ' : 'Pin ') + film.title}
            style={[styles.miniButton, film.pinned && styles.miniButtonOn]}>
            <Text style={styles.miniText}>{film.pinned ? '★ PINNED' : '☆ PIN'}</Text>
          </Pressable>
          <Text style={styles.detailsHint}>DETAILS  ›</Text>
        </View>
      </View>
    </Pressable>
  );
}
function Detail({ film, onClose, onPin, onWatched, onSaveNote }) {
  const [note, setNote] = useState(film?.note || '');
  useEffect(() => setNote(film?.note || ''), [film?.id, film?.note]);
  if (!film) return null;
  const info = availability(film);
  const link = film.letterboxd_url || (film.tmdb_id ?
    'https://www.themoviedb.org/' + (film.media_type === 'tv' ? 'tv/' : 'movie/') + film.tmdb_id : null);
  return (
    <Modal visible={!!film} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.modal}>
        <View style={styles.modalHeader}>
          <Label>FILM FILE / {film.id}</Label>
          <Pressable accessibilityRole="button" accessibilityLabel="Close details" onPress={onClose}>
            <Text style={styles.close}>CLOSE ×</Text>
          </Pressable>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={{ padding: 21, paddingBottom: 80 }} keyboardShouldPersistTaps="handled">
            <View style={{ flexDirection: 'row', gap: 17 }}>
              <Poster film={film} wide />
              <View style={{ flex: 1 }}>
                <Label color={C.gold}>{film.media_type === 'tv' ? 'TV SERIES' : 'FILM'} · {film.year || 'YEAR UNKNOWN'}</Label>
                <Text style={styles.modalTitle}>{film.title}</Text>
                <Label color={C.accent}>{info.label}</Label>
                <Label style={{ marginTop: 13 }}>SOURCE: {film.source === 'starter' ? 'OLDER LETTERBOXD SNAPSHOT' : 'YOUR REWIND DATA'}</Label>
              </View>
            </View>
            <View style={styles.sectionLine} />
            <Label>ABOUT</Label>
            <Text style={styles.bodyCopy}>{film.overview || 'No synopsis saved for this film yet.'}</Text>
            <Label style={{ marginTop: 26 }}>VIEWING AVAILABILITY</Label>
            <Text style={styles.bodyCopy}>{info.verified
              ? 'Based on a provider check from your saved Rewind data. Quotes may change.'
              : 'Not verified right now. The native app never presents old prices as current.'}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 22 }}>
              <Action title={film.pinned ? 'UNPIN' : 'PIN FILM'} secondary onPress={() => onPin(film)} style={{ flex: 1 }} />
              <Action title={film.watched ? 'MARK UNWATCHED' : 'MARK WATCHED'} onPress={() => onWatched(film)} style={{ flex: 1 }} />
            </View>
            <Label style={{ marginTop: 27 }}>YOUR NOTE</Label>
            <TextInput value={note} onChangeText={setNote}
              placeholder="Why did you save this one?" placeholderTextColor={C.muted}
              multiline maxLength={1200} style={styles.noteBox} accessibilityLabel="Your film note" />
            <Action title="SAVE NOTE" secondary onPress={() => onSaveNote(film.id, note)} />
            {link ? <Pressable accessibilityRole="link" onPress={() => Linking.openURL(link)}
              style={{ marginTop: 23 }}><Text style={styles.link}>VIEW ORIGINAL FILM PAGE  ↗</Text></Pressable> : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}
function AppBody() {
  const [tab, setTab] = useState('LIBRARY');
  const [films, setFilms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState('all');
  const [order, setOrder] = useState('recommended');
  const [selected, setSelected] = useState(null);
  const [picked, setPicked] = useState(null);
  const [excluded, setExcluded] = useState([]);
  const [summary, setSummary] = useState({ all_count: 0, pins: 0, watched: 0, imported: false });

  const refresh = useCallback(async () => {
    const [items, counts] = await Promise.all([allFilms(), stats()]);
    setFilms(items); setSummary(counts);
    setSelected(current => current ? items.find(x => x.id === current.id) || null : null);
    setPicked(current => current ? items.find(x => x.id === current.id) || null : null);
  }, []);
  useEffect(() => {
    refresh().catch(e => { setMessage('Could not open the local library: ' + e.message); })
      .finally(() => setLoading(false));
  }, [refresh]);
  const mutate = async (operation) => {
    try { await operation(); await refresh(); }
    catch (e) { Alert.alert('Could not save', e.message); }
  };
  const onPin = film => mutate(() => toggleFilm(film.id, 'pinned'));
  const onWatched = film => mutate(() => toggleFilm(film.id, 'watched'));
  const onSaveNote = (id, note) => mutate(async () => { await updateNote(id, note); setMessage('Note saved on this device.'); });
  const visible = useMemo(() => candidateFilms(films.filter(f =>
    scope === 'all' || (scope === 'pinned' && f.pinned) ||
    (scope === 'unseen' && !f.watched) || (scope === 'watched' && f.watched)
  ), query, order), [films, scope, query, order]);
  const recommended = useMemo(() => candidateFilms(films.filter(f => !f.watched)).slice(0, 10), [films]);
  const draw = () => {
    const next = discoverPick(films, excluded);
    if (!next) { setMessage('No unseen films left in this draw. Reset the deck to start again.'); return; }
    setPicked(next);
    setExcluded(previous => [...previous, next.id]);
  };
  async function doImport() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/json', 'application/octet-stream'],
        copyToCacheDirectory: true, multiple: false
      });
      if (result.canceled || !result.assets?.length) return;
      const text = await new File(result.assets[0].uri).text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { throw Error('The selected file is not valid JSON.'); }
      if (!Array.isArray(parsed.watchlist)) throw Error('Choose a Rewind Settings backup containing watchlist data.');
      Alert.alert('Import Rewind backup?', 'Merge your exported films, pins, viewing history and notes into the local app. Your edited films will be kept.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Import', onPress: async () => {
          setBusy(true);
          try { const count = await importBackup(text); await refresh(); setMessage('Imported ' + count + ' saved film and TV records.'); setTab('LIBRARY'); }
          catch (e) { Alert.alert('Import failed', e.message); }
          finally { setBusy(false); }
        }}
      ]);
    } catch(e) { Alert.alert('Could not read backup', e.message); }
  }
  async function doExport() {
    setBusy(true);
    try {
      const json = await exportBackup();
      const filename = 'rewind-native-' + new Date().toISOString().slice(0, 10) + '.json';
      const file = new File(Paths.cache, filename);
      file.create({ overwrite: true });
      await file.write(json);
      if (!await Sharing.isAvailableAsync()) throw Error('File sharing is unavailable on this device.');
      await Sharing.shareAsync(file.uri, { mimeType: 'application/json', UTI: 'public.json' });
      setMessage('Backup prepared. Save the shared JSON file somewhere safe.');
    } catch(e) { Alert.alert('Could not export backup', e.message); }
    finally { setBusy(false); }
  }
  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <View style={styles.header}>
        <View>
          <Label color={C.gold} style={{ letterSpacing: 2 }}>EST. 2026  /  YOUR FILM ARCHIVE</Label>
          <Text style={styles.wordmark}>REWIND<Text style={{ color: C.accent }}>▰</Text></Text>
        </View>
        <View style={styles.counter}><Text style={styles.counterValue}>{films.length}</Text><Label>FILES</Label></View>
      </View>
      {loading ? <View style={styles.center}><ActivityIndicator size="large" color={C.accent} /><Text style={styles.bodyCopy}>Opening your on-device library…</Text></View> : (
        <>
          {tab === 'LIBRARY' ? (
            <FlatList keyboardShouldPersistTaps="handled" data={visible} keyExtractor={item => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item }) => <FilmCard film={item} onOpen={setSelected} onPin={onPin} />}
              ListHeaderComponent={
                <View>
                  <Text style={styles.sectionTitle}>MY FILMS <Text style={{ color: C.accent }}>↘</Text></Text>
                  <Text style={styles.lead}>{summary.imported ? 'Your imported collection, stored on this iPhone.' :
                    'An offline starter snapshot from May 2026. Import your latest Rewind backup in Settings.'}</Text>
                  <TextInput style={styles.search} value={query} onChangeText={setQuery}
                    autoCorrect={false} placeholder="Search saved films…" placeholderTextColor={C.muted}
                    accessibilityLabel="Search saved films" />
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                    {[['all','ALL'],['unseen','TO WATCH'],['pinned','PINNED'],['watched','WATCHED']].map(([id,label]) =>
                      <Pressable key={id} onPress={() => setScope(id)}
                        style={[styles.chip,scope === id && styles.chipActive]} accessibilityRole="button">
                        <Text style={[styles.chipText,scope === id && {color:C.black}]}>{label}</Text>
                      </Pressable>)}
                  </ScrollView>
                  <View style={styles.sortRow}>
                    <Label>{visible.length} MATCHES</Label>
                    <Pressable onPress={() => setOrder(v => v === 'recommended' ? 'az' : v === 'az' ? 'year' : 'recommended')}>
                      <Text style={styles.sortLink}>SORT: {order === 'recommended' ? 'RECOMMENDED' : order === 'az' ? 'TITLE A–Z' : 'NEWEST'}  ↕</Text>
                    </Pressable>
                  </View>
                </View>}
              ListEmptyComponent={<Text style={styles.lead}>No films in this view.</Text>}
            />
          ) : tab === 'DISCOVER' ? (
            <ScrollView contentContainerStyle={styles.list}>
              <Text style={styles.sectionTitle}>THE DRAW <Text style={{ color: C.accent }}>✳</Text></Text>
              <Text style={styles.lead}>A native, offline picker from films you've saved. No unchecked title is disqualified just because Rewind doesn't know where to stream it.</Text>
              <View style={styles.draw}>
                {picked ? <>
                  <Label color={C.gold}>TONIGHT'S WILD CARD</Label>
                  <View style={{ flexDirection: 'row', gap: 18, marginTop: 14 }}>
                    <Poster film={picked} wide />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalTitle}>{picked.title}</Text>
                      <Label>{picked.year || 'YEAR UNKNOWN'} · {picked.media_type === 'tv' ? 'TV' : 'FILM'}</Label>
                      <Label color={C.accent} style={{ marginTop: 16 }}>{availability(picked).label}</Label>
                    </View>
                  </View>
                  <Action title="OPEN FILM DETAILS" secondary onPress={() => setSelected(picked)} style={{ marginTop: 15 }} />
                </> : <>
                  <Label color={C.gold}>SAVED FILMS · FRESH DRAW</Label>
                  <Text style={styles.drawIntro}>One good reason to finally watch something from your collection.</Text>
                </>}
                <Action title={picked ? 'DRAW ANOTHER' : 'PICK FROM MY COLLECTION'} onPress={draw} style={{ marginTop: 20 }} />
                {excluded.length ? <Pressable onPress={() => { setExcluded([]); setPicked(null); }}>
                  <Label style={{ textAlign: 'center', marginTop: 16 }}>RESET THE DECK · {excluded.length} ALREADY DRAWN</Label>
                </Pressable> : null}
              </View>
              <Label style={{ marginTop: 27, marginBottom: 11 }}>STRONG CONNECTIONS FROM YOUR COLLECTION</Label>
              {recommended.map(f => <FilmCard key={f.id} film={f} onOpen={setSelected} onPin={onPin} />)}
              <Text style={styles.footnote}>This foundation is an offline collection picker. New-title discovery and live price tracking are not connected yet.</Text>
            </ScrollView>
          ) : (
            <ScrollView contentContainerStyle={styles.list}>
              <Text style={styles.sectionTitle}>THE VAULT</Text>
              <Text style={styles.lead}>A local database, not a browser tab. Your collection persists between launches and can be backed up as a file.</Text>
              <View style={styles.panel}>
                <Label color={C.gold}>LOCAL LIBRARY</Label>
                <Text style={styles.statValue}>{films.length} titles</Text>
                <Text style={styles.bodyCopy}>{summary.pins || 0} pinned · {summary.watched || 0} marked watched</Text>
                <Text style={styles.bodyCopy}>{summary.imported ? 'Personal Rewind backup imported.' : 'Starter catalog: May 27, 2026. This is not live Letterboxd sync.'}</Text>
              </View>
              <View style={styles.panel}>
                <Label color={C.gold}>MOVE YOUR REAL REWIND COLLECTION</Label>
                <Text style={styles.bodyCopy}>In the website, open Settings → Storage recovery → Download backup JSON. Then import that file here. Existing pins and notes won't be silently erased.</Text>
                <Action title={busy ? 'WORKING…' : 'IMPORT REWIND JSON'} onPress={doImport} disabled={busy} style={{ marginTop: 17 }} />
                <Action title="EXPORT NATIVE BACKUP" secondary onPress={doExport} disabled={busy} style={{ marginTop: 10 }} />
              </View>
              <View style={styles.panel}>
                <Label color={C.gold}>HONEST LIMITS</Label>
                <Text style={styles.bodyCopy}>This first native build stores films offline and uses past availability snapshots when valid. It does not have background server checks, live Letterboxd Watchlist syncing, push notifications, or fresh rental quotes yet.</Text>
                <Text style={[styles.bodyCopy, { marginTop: 12 }]}>No developer API keys or paid accounts are stored in the app.</Text>
              </View>
            </ScrollView>
          )}
        </>
      )}
      {!!message && <Pressable onPress={() => setMessage('')} style={styles.message}>
        <Text style={styles.messageText}>{message}  ×</Text>
      </Pressable>}
      <View style={styles.tabs}>
        {TABS.map(item => <Pressable key={item} accessibilityRole="tab" accessibilityState={{ selected: tab === item }}
          onPress={() => setTab(item)} style={[styles.tab, tab === item && styles.tabActive]}>
          <Text style={[styles.tabText, tab === item && { color: C.accent }]}>{item}</Text>
        </Pressable>)}
      </View>
      <Detail film={selected} onClose={() => setSelected(null)} onPin={onPin} onWatched={onWatched} onSaveNote={onSaveNote} />
    </SafeAreaView>
  );
}
export default function App() { return <SafeAreaProvider><AppBody /></SafeAreaProvider>; }

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg }, modal: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 21, paddingTop: 18, paddingBottom: 18, flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1, borderColor: C.line, alignItems: 'center' },
  label: { fontSize: 10, fontWeight: '700', letterSpacing: 1.1, lineHeight: 15 },
  wordmark: { fontSize: 40, fontWeight: '900', color: C.text, letterSpacing: -2.5, marginTop: 5 },
  counter: { paddingLeft: 15, borderLeftWidth: 1, borderColor: C.line, alignItems: 'center' },
  counterValue: { color: C.text, fontSize: 26, fontWeight: '800' },
  list: { padding: 20, paddingBottom: 44 }, sectionTitle: { fontSize: 28, fontWeight: '900', color: C.text, letterSpacing: -0.8, marginBottom: 9 },
  lead: { fontSize: 13, lineHeight: 21, color: C.muted, marginBottom: 19 },
  search: { backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 8, height: 48, color: C.text, paddingHorizontal: 14, fontSize: 15 },
  chips: { gap: 8, paddingVertical: 17 },
  chip: { borderWidth: 1, borderColor: C.line, borderRadius: 6, paddingHorizontal: 14, paddingVertical: 10 },
  chipActive: { backgroundColor: C.accent, borderColor: C.accent },
  chipText: { color: C.text, fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  sortRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14, alignItems: 'center' },
  sortLink: { color: C.accent, fontSize: 10, letterSpacing: 0.5, fontWeight: '800' },
  film: { flexDirection: 'row', gap: 13, padding: 12, borderWidth: 1, borderColor: C.line, borderRadius: 10, backgroundColor: C.panel, marginBottom: 10, minHeight: 143 },
  poster: { width: 87, height: 128, overflow: 'hidden', backgroundColor: '#2a3c33', borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  posterWide: { width: 116, height: 171 },
  posterImage: { width: '100%', height: '100%' },
  posterFallback: { color: C.accent, fontSize: 13, fontWeight: '900', letterSpacing: 0.6, textAlign: 'center', lineHeight: 24 },
  filmMain: { flex: 1, minWidth: 0 },
  filmTitle: { color: C.text, fontSize: 17, lineHeight: 21, fontWeight: '800' },
  filmActions: { marginTop: 'auto', paddingTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  miniButton: { paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: C.line, borderRadius: 5 },
  miniButtonOn: { borderColor: C.gold },
  miniText: { color: C.gold, fontWeight: '800', fontSize: 10 },
  detailsHint: { color: C.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderColor: C.line },
  close: { color: C.accent, fontWeight: '900', letterSpacing: 1 },
  modalTitle: { color: C.text, fontSize: 26, fontWeight: '900', lineHeight: 30, marginVertical: 12 },
  sectionLine: { height: 1, backgroundColor: C.line, marginVertical: 23 },
  bodyCopy: { color: C.text, lineHeight: 22, fontSize: 14, marginTop: 9 },
  action: { backgroundColor: C.accent, padding: 13, minHeight: 44, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  actionSecondary: { backgroundColor: '#273b32', borderWidth: 1, borderColor: C.line },
  actionText: { fontSize: 11, fontWeight: '900', color: C.black, letterSpacing: 0.7, textAlign: 'center' },
  noteBox: { color: C.text, backgroundColor: C.panel, borderWidth: 1, borderColor: C.line, borderRadius: 8, padding: 14, minHeight: 100, textAlignVertical: 'top', marginTop: 8, marginBottom: 12, fontSize: 14 },
  link: { color: C.accent, fontWeight: '800', fontSize: 12, letterSpacing: 0.5 },
  tabs: { flexDirection: 'row', borderTopWidth: 1, borderColor: C.line, backgroundColor: C.bg, paddingHorizontal: 10, paddingTop: 5 },
  tab: { flex: 1, paddingVertical: 15, alignItems: 'center' }, tabActive: { borderTopWidth: 2, borderColor: C.accent, marginTop: -6, paddingTop: 19 },
  tabText: { color: C.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  panel: { borderWidth: 1, borderColor: C.line, backgroundColor: C.panel, borderRadius: 10, padding: 18, marginBottom: 14 },
  statValue: { fontWeight: '900', color: C.text, fontSize: 31, marginTop: 8 },
  draw: { padding: 20, borderWidth: 1, borderColor: C.line, borderRadius: 12, backgroundColor: C.panel },
  drawIntro: { color: C.text, fontSize: 19, lineHeight: 28, fontWeight: '700', marginTop: 15 },
  footnote: { color: C.muted, fontSize: 11, marginTop: 23, lineHeight: 18 },
  message: { paddingHorizontal: 18, paddingVertical: 11, backgroundColor: '#344f41' },
  messageText: { color: C.text, fontSize: 12, fontWeight: '700' }
});
