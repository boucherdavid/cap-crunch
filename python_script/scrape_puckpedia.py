import os
import re
import sys
import time
import threading
import requests
import pandas as pd
from bs4 import BeautifulSoup
from unidecode import unidecode
from shutil import which
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

sys.stdout.reconfigure(encoding='utf-8')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SOURCE_DIR = os.path.join(BASE_DIR, "source")
DIAGNOSTICS_DIR = os.path.join(BASE_DIR, "diagnostics")
DIAGNOSTICS_PLAYERS_DIR = os.path.join(BASE_DIR, "diagnostics_joueurs")
TEAMS_OFFLINE_DIR = os.path.join(BASE_DIR, "teams_offline")
OUTPUT_CSV = os.path.join(BASE_DIR, "PuckPedia_update.csv")
OFFLINE_CSV = os.path.join(BASE_DIR, "PuckPedia_offline.csv")
DEFAULT_SOURCE_CSV = os.path.join(SOURCE_DIR, "teams_todo.csv")
PUCKPEDIA_BASE_URL = "https://puckpedia.com"

# Cache mémoire (le temps d'un run) des salaires réels déjà récupérés par joueur,
# pour éviter de re-télécharger la même fiche si plusieurs saisons sont retenues.
SALAIRES_REELS_CACHE = {}

def fusionner_equipes(dossier=TEAMS_OFFLINE_DIR, fichier_sortie=OUTPUT_CSV):
    print(f"\n🔄 Fusion des fichiers CSV du dossier : {dossier}")
    fichiers = [f for f in os.listdir(dossier) if f.endswith(".csv")]
    print(f"📁 Fichiers détectés : {len(fichiers)}")

    all_data = pd.DataFrame()

    for fichier in fichiers:
        chemin = os.path.join(dossier, fichier)
        try:
            df = pd.read_csv(chemin, sep=';')
            print(f"✅ Chargé : {fichier} ({len(df)} lignes)")
            all_data = pd.concat([all_data, df], ignore_index=True)
        except Exception as e:
            print(f"❌ Erreur avec {fichier} : {e}")

    if not all_data.empty:
        # 🧼 Réorganisation des colonnes
        colonnes_fixes = ['Joueur', 'Equipe', 'Statut', 'Position', 'Age', 'ELC_Saisons', 'Salaire_Reel_Saisons']
        colonnes_salaires = [col for col in all_data.columns if "20" in col and "-" in col]
        colonnes_finales = colonnes_fixes + colonnes_salaires

        # Ajout des colonnes manquantes si nécessaire
        for col in colonnes_finales:
            if col not in all_data.columns:
                all_data[col] = ''

        all_data = all_data[colonnes_finales]

        all_data.to_csv(fichier_sortie, index=False, sep=';')
        print(f"\n📦 Fichier fusionné sauvegardé : {fichier_sortie}")
        print(f"👥 Total joueurs : {len(all_data)} | Équipes uniques : {all_data['Equipe'].nunique()}")
    else:
        print("⚠️ Aucun fichier valide à fusionner.")

def test_url_accessible(url):
    try:
        headers = {"User-Agent": "Mozilla/5.0"}
        r = requests.get(url, headers=headers, timeout=10)
        return r.status_code == 200
    except:
        return False

def get_driver(headless=True):
    options = Options()
    if headless:
        options.add_argument("--headless=new")
    options.add_argument("--disable-gpu")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")
    # Les pages PuckPedia contiennent des pubs/vidéos tierces qui ne terminent
    # parfois jamais leur chargement — la stratégie par défaut ("normal")
    # attend TOUTES les ressources et peut bloquer driver.get() indéfiniment.
    # "eager" n'attend que le DOM (le tableau qu'on scrape est déjà là) ;
    # on attend explicitement l'élément voulu via WebDriverWait ensuite.
    options.page_load_strategy = 'eager'

    chrome_path = which("chromedriver")
    service = Service(executable_path=chrome_path)
    return webdriver.Chrome(service=service, options=options)


def naviguer_avec_timeout(driver, url, timeout):
    """Navigue vers `url` avec un timeout matériel. Le page_load_timeout de
    Selenium n'est pas toujours fiable (une ressource tierce qui ne termine
    jamais son chargement, ex. une pub, peut bloquer driver.get() indéfiniment
    malgré le timeout configuré). Utilise un thread daemon (pas
    ThreadPoolExecutor — son shutdown attend le thread bloqué même après un
    timeout sur future.result(), ce qui annule l'effet recherché) : si le
    thread est toujours vivant après `timeout` secondes, on tue le processus
    chromedriver sous-jacent pour le débloquer et on abandonne. Le driver est
    alors mort — l'appelant doit en recréer un. Retourne True si la
    navigation a abouti dans le temps imparti."""
    resultat = {'ok': False}

    def _get():
        try:
            driver.get(url)
            resultat['ok'] = True
        except Exception:
            pass

    thread = threading.Thread(target=_get, daemon=True)
    thread.start()
    thread.join(timeout)
    if thread.is_alive():
        tuer_driver(driver)
        return False
    return resultat['ok']


def tuer_driver(driver):
    """Tue le processus chromedriver/Chrome sous-jacent sans attendre de
    réponse — utilisé quand le driver est bloqué et qu'un .quit() normal
    risque lui aussi de rester bloqué indéfiniment."""
    try:
        driver.service.process.kill()
    except Exception:
        pass
    try:
        driver.quit()
    except Exception:
        pass

def telecharger_html(url, sigle, headless=True, timeout=30, driver=None):
    """Télécharge le HTML d'une page d'équipe. Si `driver` est fourni, réutilise
    cette fenêtre Chrome (navigation vers une nouvelle URL) au lieu d'en ouvrir
    une nouvelle — évite l'accumulation de fenêtres sur un run complet.
    Retourne True si un HTML frais a bien été écrit, False sinon (le caller ne
    doit alors PAS réutiliser un fichier existant sans le signaler clairement)."""
    print(f"\n🌐 Ouverture de la page {url} pour {sigle}")
    driver_local = driver is None
    try:
        if driver is None:
            driver = get_driver(headless)
        driver.set_page_load_timeout(timeout)
        driver.set_script_timeout(timeout)

        if not naviguer_avec_timeout(driver, url, timeout + 10):
            print(f"❌ Chargement de {sigle} bloqué au-delà de {timeout + 10}s (ressource tierce probablement figée) — abandon")
            return False

        print("⏳ Attente du tableau principal...")
        try:
            WebDriverWait(driver, 20).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'table.pp_table'))
            )
            print("✅ Tableau détecté")
        except Exception as e:
            print(f"⚠️ Tableau non détecté pour {sigle} : {e}")
            return False

        time.sleep(2)
        html = driver.page_source
        with open(os.path.join(DIAGNOSTICS_DIR, f"{sigle}_source.html"), "w", encoding="utf-8") as f:
            f.write(html)
        print(f"📥 HTML complet sauvegardé pour {sigle}")
        return True

    except Exception as e:
        print(f"❌ Erreur Selenium pour {sigle} : {e}")
        return False

    finally:
        if driver_local and driver:
            try:
                driver.quit()
            except Exception:
                pass


def extraire_salaires_reels(html):
    """Extrait, depuis la fiche d'un joueur, le cap hit plein (non réduit par
    une rétention de salaire) pour chaque saison, à partir des tableaux
    'Contrat' (un par contrat de la carrière — inclut la saison en cours et
    les saisons futures d'un contrat actif, contrairement au tableau de stats
    saison-par-saison qui ne couvre que les saisons déjà jouées).
    Retourne {'2025-26': 6500000, ...} (clé = saison au format court, comme
    dans les colonnes du CSV)."""
    soup = BeautifulSoup(html, "html.parser")
    saisons = {}
    for table in soup.find_all("table", class_="pp_table-contract"):
        thead = table.find("thead")
        tbody = table.find("tbody")
        if not thead or not tbody:
            continue
        headers = [th.get_text(strip=True) for th in thead.find_all("th")][1:]
        cap_row = None
        for row in tbody.find_all("tr"):
            tds = row.find_all("td")
            if tds and tds[0].get_text(strip=True).lower() == "cap hit":
                cap_row = tds[1:]
                break
        if not cap_row:
            continue
        for season, cell in zip(headers, cap_row):
            if not re.match(r"^\d{4}-\d{2}$", season):
                continue
            text = cell.get_text(strip=True)
            m = re.search(r"\$([\d,]+)", text)
            if not m:
                continue
            try:
                saisons[season] = int(m.group(1).replace(",", ""))
            except Exception:
                continue
    return saisons


def recuperer_salaires_reels(player_url, name, headless=True, timeout=30, driver=None):
    """Télécharge la fiche d'un joueur et retourne ses cap hits pleins par
    saison (utilisé pour corriger un cap hit réduit par rétention de salaire
    affiché sur une page d'équipe). Mise en cache mémoire pour le run courant.
    Si `driver` est fourni, réutilise cette fenêtre Chrome au lieu d'en ouvrir
    une nouvelle — évite l'accumulation de fenêtres sur un run complet."""
    if player_url in SALAIRES_REELS_CACHE:
        return SALAIRES_REELS_CACHE[player_url]

    driver_local = driver is None
    resultat = {}
    try:
        if driver is None:
            driver = get_driver(headless)
        driver.set_page_load_timeout(timeout)
        driver.set_script_timeout(timeout)
        if not naviguer_avec_timeout(driver, player_url, timeout + 10):
            print(f"⚠️ Chargement de la fiche de {name} bloqué au-delà de {timeout + 10}s — abandon")
            SALAIRES_REELS_CACHE[player_url] = resultat
            return resultat

        try:
            WebDriverWait(driver, 20).until(
                EC.presence_of_element_located((By.CSS_SELECTOR, 'table.pp_table-contract'))
            )
        except Exception as e:
            print(f"⚠️ Tableau de contrat non détecté sur la fiche de {name} : {e}")

        time.sleep(2)
        html = driver.page_source
        print(f"   [diag] fiche {name} : {len(html)} caractères reçus")

        if "cf-turnstile" in html.lower() or "un instant" in html.lower():
            print(f"⚠️ Défi Cloudflare non résolu pour la fiche de {name}")
            SALAIRES_REELS_CACHE[player_url] = resultat
            return resultat

        os.makedirs(DIAGNOSTICS_PLAYERS_DIR, exist_ok=True)
        slug = player_url.rstrip("/").split("/")[-1]
        with open(os.path.join(DIAGNOSTICS_PLAYERS_DIR, f"{slug}.html"), "w", encoding="utf-8") as f:
            f.write(html)

        resultat = extraire_salaires_reels(html)
        if not resultat:
            nb_tables = html.count('pp_table-contract')
            print(f"   [diag] {name} : 0 saison extraite (pp_table-contract trouvé {nb_tables}x dans le HTML)")
    except Exception as e:
        print(f"❌ Erreur Selenium pour la fiche de {name} : {e}")
    finally:
        if driver_local and driver:
            try:
                driver.quit()
            except Exception:
                pass

    SALAIRES_REELS_CACHE[player_url] = resultat
    return resultat


def clean_salary(val):
    try:
        val = val.replace(",", "").replace("$", "").strip()
        return int(val)
    except:
        return 0

def scraper_depuis_html(fichier_html, sigle, headless=True, driver=None):
    print(f"\n📄 Lecture du fichier HTML : {fichier_html}")
    with open(fichier_html, "r", encoding="utf-8") as f:
        html = f.read()

    soup = BeautifulSoup(html, "html.parser")
    tables = soup.find_all("table")
    print(f"📊 Nombre total de tableaux : {len(tables)}")

    all_players = []
    total_detected = 0

    # Sections à ignorer : rachetés seulement
    # Les "Retained Salary" sont conservés car ils sont nécessaires pour
    # reconstituer le cap hit complet des joueurs échangés avec rétention.
    SECTIONS_TO_SKIP = ['buyout']

    for idx, table in enumerate(tables):
        # Détecter le titre de section précédant ce tableau
        section_heading = ""
        for tag in ['h1', 'h2', 'h3', 'h4']:
            heading = table.find_previous(tag)
            if heading:
                section_heading = heading.get_text(strip=True).lower()
                break

        if any(keyword in section_heading for keyword in SECTIONS_TO_SKIP):
            print(f"⏭️  Tableau {idx+1} ignoré (section : '{section_heading}')")
            continue

        headers = table.find_all("th")
        year_labels = [cell.get_text(strip=True) for cell in headers if "20" in cell.get_text(strip=True) and "-" in cell.get_text(strip=True)]
        rows = table.find_all("tr")
        print(f"📋 Tableau {idx+1} : {len(rows)} lignes détectées")
        lignes_utiles = 0

        for row in rows:
            cells = row.find_all("td")
            if not cells or len(cells) < 2:
                continue

            a_tag = cells[0].find("a")
            if a_tag:
                name = a_tag.get_text(strip=True)
            else:
                # Fallback quand la cellule n'a pas de lien joueur : cells[0].get_text()
                # collait le nom aux blocs position/âge/tir imbriqués sans séparateur
                # (ex: "EdvinssonDage23cap$894k") faute de <a>, produisant un nhl_id
                # jamais résolu et donc un nouveau joueur en double à chaque run du
                # pipeline plutôt qu'une mise à jour du joueur existant. On retire les
                # blocs d'info (mêmes <div>/<span> lus plus bas pour position/âge/tir)
                # avant de lire le texte restant, qui ne devrait être que le nom.
                name_only = BeautifulSoup(str(cells[0]), "html.parser")
                for info_tag in name_only.find_all(["div", "span"]):
                    info_tag.decompose()
                name = name_only.get_text(strip=True)
            if not name or not any(c.isalpha() for c in name):
                continue

            player_href = a_tag.get("href", "") if a_tag else ""
            player_url = f"{PUCKPEDIA_BASE_URL}{player_href}" if player_href.startswith("/") else (player_href or None)

            age, position, shot = "", "", ""

            # 🔍 Détection agressive de la position "G"
            spans = cells[0].find_all("span")
            for i in range(len(spans) - 1):
                key = spans[i].get_text(strip=True).lower()
                val = spans[i + 1].get_text(strip=True).upper()
                if key == "pos" and val == "G":
                    position = "G"
                elif key == "catches":
                    shot = val

            # 🔄 Fallback sur les autres blocs div
            if not position or not shot:
                info_blocks = cells[0].find_all("div")
                for block in info_blocks:
                    spans = block.find_all("span")
                    if len(spans) >= 2:
                        key = spans[0].get_text(strip=True).lower()
                        val = spans[1].get_text(strip=True)
                        if "age" in key:
                            age = val
                        elif "pos" in key and not position:
                            position = val
                        elif "shot" in key and not shot:
                            shot = val

            # 🧠 Inférence gardien via majuscule dans "Tir"
            if not position and shot in ["L", "R"]:
                position = "G"

            # 🧼 Fallback texte brut
            if not position:
                raw_text = cells[0].get_text(" ", strip=True).lower()
                if "goalie" in raw_text or "goaltender" in raw_text or "g " in raw_text or raw_text.endswith(" g"):
                    position = "G"

            # 🎓 Détection ELC depuis la cellule du nom du joueur
            first_cell_html = str(cells[0])
            is_elc_player = (
                'data-content="Entry Level Contract"' in first_cell_html
                or "pp-elc" in first_cell_html
                or 'title="Entry Level Contract"' in first_cell_html
                or 'alt="ELC"' in first_cell_html
                or 'class="elc"' in first_cell_html
                or "entry level" in first_cell_html.lower()
            )

            # 💰 Extraction des salaires + détection ELC par cellule
            salaries = {}
            statut = ""
            elc_saisons = []
            retained_saisons = []

            for i, year in enumerate(year_labels):
                cell_index = 1 + i
                if cell_index < len(cells):
                    cell = cells[cell_index]
                    raw = cell.get("data-extract_ch", "")
                    text = cell.get_text(strip=True)
                    val = raw if raw else text
                    try:
                        salaries[year] = int(float(val.replace("$", "").replace(",", "")))
                    except:
                        salaries[year] = val if val else "FA"

                    # 🎓 Détection ELC par cellule (plusieurs variantes HTML)
                    cell_html = str(cell)
                    if (
                        'data-content="Entry Level Contract"' in cell_html
                        or "pp-elc" in cell_html
                        or 'title="Entry Level Contract"' in cell_html
                        or "entry level" in cell_html.lower()
                    ):
                        elc_saisons.append(year)
                        is_elc_player = True

                    # 💸 Détection cap hit réduit par rétention de salaire (icône
                    # loupe sur PuckPedia) : le montant affiché sur la page
                    # d'équipe n'est que la portion payée par l'équipe actuelle,
                    # pas le vrai cap hit du contrat — on veut toujours le plein.
                    if 'data-title="Retained Salary"' in cell_html:
                        retained_saisons.append(year)
                else:
                    salaries[year] = "FA"

            # 💸 Correction : remplacer les saisons à salaire retenu par le vrai
            # cap hit plein, récupéré depuis la fiche du joueur.
            saisons_corrigees = []
            if retained_saisons and player_url:
                print(f"💸 Salaire retenu détecté pour {name} ({retained_saisons}) — récupération du vrai cap hit sur {player_url}")
                vrais_salaires = recuperer_salaires_reels(player_url, name, headless=headless, driver=driver)
                if vrais_salaires:
                    for year in retained_saisons:
                        if year in vrais_salaires:
                            print(f"   {year} : {salaries.get(year)} (réduit) -> {vrais_salaires[year]} (plein)")
                            salaries[year] = vrais_salaires[year]
                            saisons_corrigees.append(year)
                        else:
                            print(f"   ⚠️ Saison {year} introuvable sur la fiche joueur, valeur réduite conservée")
                else:
                    print(f"   ⚠️ Impossible de récupérer la fiche joueur pour {name}, valeur réduite conservée")

            # Statut global ELC si au moins une saison est ELC
            if is_elc_player or elc_saisons:
                statut = "ELC"
                # Si ELC détecté au niveau joueur mais pas par cellule,
                # marquer toutes les saisons avec salaire non-nul comme ELC
                if is_elc_player and not elc_saisons:
                    elc_saisons = [y for y in year_labels if isinstance(salaries.get(y), int) and salaries[y] > 0]

            # 🔍 Détection UFA/RFA
            for i, year in enumerate(year_labels):
                cell_index = 1 + i
                if cell_index < len(cells):
                    cell = cells[cell_index]
                    span = cell.find("span", class_="pp-ufa") or cell.find("span", class_="pp-rfa")
                    if span:
                        statut_html = span.get_text(strip=True).upper()
                        if statut_html in ["UFA", "RFA"]:
                            salaries[year] = statut_html

            player_data = {
                'Joueur': name,
                'Equipe': sigle,
                'Position': position,
                'Age': age,
                'Statut': statut,
                'ELC_Saisons': '|'.join(elc_saisons),
                # Saisons où le cap hit réduit (rétention) a été remplacé par le
                # vrai montant plein depuis la fiche du joueur — signale à
                # l'import de ne pas re-sommer ces saisons avec un fragment
                # retenu par l'équipe d'origine (double comptage sinon).
                'Salaire_Reel_Saisons': '|'.join(saisons_corrigees),
                **salaries
            }
            all_players.append(player_data)
            lignes_utiles += 1
            print(f"👤 {name} | Âge: {age} | Pos: {position} | Statut: {statut} | Salaires: {list(salaries.values())}")

        print(f"✅ Tableau {idx+1} : {lignes_utiles} joueurs extraits")
        total_detected += lignes_utiles

    df = pd.DataFrame(all_players)
    print(f"\n👥 Total joueurs extraits : {total_detected}")

    for col in df.columns:
        if df[col].dtype == object:
            df[col] = df[col].apply(lambda x: unidecode(str(x)) if pd.notna(x) else x)

    mots_exclus = ['Totals', 'Annual Cap Hit', 'Current Cap Space', 'Deadline Cap Space', 'LTIR Pool',
                   'Actual Salary Paid', 'Bonus Overages', 'Projected Cap Hit', 'NHL Cap Limit',
                   'Active Roster', 'Standard Contracts', 'Retained Remaining', 'Bonus Carryover Overage',
                   'Projected Cap Space', 'Potential Bonuses']
    df = df[~df['Joueur'].isin(mots_exclus)]
    df = df.drop_duplicates(subset=['Joueur', 'Equipe'])

    year_cols = [col for col in df.columns if "20" in col and "-" in col]
    if year_cols:
        first_year = year_cols[0]
        df[first_year + '_sort'] = df[first_year].apply(lambda x: int(x) if str(x).isdigit() else -1)
        df = df.sort_values(by=[first_year + '_sort'], ascending=False)
        df = df.drop(columns=[first_year + '_sort'])

    # ✅ Colonnes finales sans "Tir"
    final_order = ['Joueur', 'Equipe', 'Statut', 'Position', 'Age', 'ELC_Saisons', 'Salaire_Reel_Saisons'] + year_cols
    for col in final_order:
        if col not in df.columns:
            df[col] = ''
    df = df[final_order]

    # ✅ Suppression des ".0" dans les colonnes numériques
    def nettoyer_valeur(val):
        try:
            f = float(val)
            if f.is_integer():
                return int(f)
            return f
        except:
            return val

    for col in year_cols:
        df[col] = df[col].apply(nettoyer_valeur)

    print(f"✅ Extraction finale pour {sigle} : {len(df)} joueurs retenus")
    return df

def scraper_depuis_csv_source(csv_path=DEFAULT_SOURCE_CSV, headless=True):
    print(f"\n📁 Chargement du fichier source : {csv_path}")
    df_urls = pd.read_csv(csv_path, sep=';')
    print(f"🔢 Total d’équipes à traiter : {len(df_urls)}")

    os.makedirs(DIAGNOSTICS_DIR, exist_ok=True)
    os.makedirs(TEAMS_OFFLINE_DIR, exist_ok=True)

    all_table = pd.DataFrame()

    # Une seule fenêtre Chrome réutilisée pour tout le run (équipes + fiches
    # joueurs pour les salaires retenus) — évite l'accumulation de fenêtres.
    driver = get_driver(headless)
    equipes_perimees = []
    try:
        for _, row in df_urls.iterrows():
            url = row['URL']
            sigle = row['Team']
            print(f"\n🚀 Traitement de {sigle} — {url}")

            html_file = os.path.join(DIAGNOSTICS_DIR, f"{sigle}_source.html")

            # Toujours retélécharger : un HTML mis en cache peut dater de mois,
            # ce qui masquerait silencieusement transactions/signatures récentes.
            frais = telecharger_html(url, sigle, headless=headless, driver=driver)

            if not frais:
                # Ne pas sonder la fenêtre (ex: driver.title) : si elle est
                # bloquée, la sonde elle-même risque de rester bloquée. On la
                # tue et on en recrée une fraîche systématiquement, pour ne
                # pas planter en boucle sur toutes les équipes restantes.
                print("♻️  Fenêtre Chrome relancée (chargement précédent bloqué ou échoué)...")
                tuer_driver(driver)
                driver = get_driver(headless)
                # Une seconde chance avec la fenêtre fraîche avant d'abandonner l'équipe.
                frais = telecharger_html(url, sigle, headless=headless, driver=driver)

            if not frais:
                if os.path.exists(html_file):
                    print(f"⚠️  ATTENTION : échec du téléchargement pour {sigle} — utilisation du HTML déjà présent sur disque (potentiellement PÉRIMÉ, pas forcément les données actuelles).")
                    equipes_perimees.append(sigle)
                else:
                    print(f"❌ HTML introuvable pour {sigle}, équipe ignorée")
                    continue

            try:
                df = scraper_depuis_html(html_file, sigle, headless=headless, driver=driver)
                df.to_csv(os.path.join(TEAMS_OFFLINE_DIR, f"{sigle}.csv"), index=False, sep=';')
                all_table = pd.concat([all_table, df], ignore_index=True)
            except Exception as e:
                print(f"❌ Erreur avec {sigle} : {e}")
    finally:
        try:
            driver.quit()
        except Exception:
            pass

    all_table.to_csv(OFFLINE_CSV, index=False, sep=';')
    print(f"\n📦 Fichier global sauvegardé : ./PuckPedia_offline.csv")

    if equipes_perimees:
        print(f"\n⚠️  {len(equipes_perimees)} équipe(s) avec données potentiellement PÉRIMÉES (échec de retéléchargement) : {equipes_perimees}")
        print("    Relancer le scraping pour ces équipes avant de faire confiance aux données.")

    if 'Equipe' in all_table.columns:
        print(f"📊 Total équipes traitées : {len(all_table['Equipe'].unique())}")
    else:
        print("⚠️ Aucune équipe n’a été traitée avec succès.")


def main():
    scraper_depuis_csv_source(headless=False)
    fusionner_equipes()

if __name__ == "__main__":
    main()
