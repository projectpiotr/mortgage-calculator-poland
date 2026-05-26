# Kalkulator Kredytu Hipotecznego z Nadpłatami

Nowoczesna, interaktywna aplikacja webowa do symulacji spłaty kredytu hipotecznego, analizy wpływu nadpłat na oszczędności odsetkowe oraz wizualizacji harmonogramów amortyzacyjnych.

Projekt został zbudowany z myślą o profesjonalnej estetyce budzącej zaufanie (granat, niebieski, szmaragdowa zieleń) i precyzyjnych kalkulacjach finansowych zgodnych z algorytmami bankowymi w Polsce.

---

## Główne Funkcje

1.  **Automatyczna synchronizacja WIBOR:** Aplikacja przy starcie pobiera aktualne stawki referencyjne WIBOR (1M, 3M, 6M) bezpośrednio z serwisu GPW Benchmark S.A. za pomocą zapytań proxy (zabezpieczenie przed ograniczeniami CORS). W przypadku braku dostępu do sieci stosowany jest mechanizm zapasowy (stawki z dnia 22.05.2026 r.) oraz informacyjny komunikat (toast).
2.  **Dwa tryby wpływu nadpłat:**
    *   **Zmniejszenie ilości rat (Skrócenie okresu):** Utrzymuje wysokość dotychczasowej raty, a nadpłaty w całości pomniejszają kapitał, znacznie przyspieszając spłatę całego kredytu (opcja wysoce zalecana i najbardziej opłacalna).
    *   **Obniżenie wysokości raty:** Recalculuje wysokość raty po każdej nadpłacie, zachowując pierwotną datę zakończenia umowy.
3.  **Indywidualny harmonogram nadpłat (Interaktywny):** Poza stałą nadpłatą miesięczną, użytkownik może dodać jednorazowe nadpłaty w dowolnym miesiącu klikając bezpośrednio na pole „Nadpłata” w tabeli harmonogramu lub korzystając z bocznego formularza.
4.  **Szczegółowy harmonogram spłat:** Paginowana tabela prezentująca dla każdego miesiąca podział na część kapitałową, odsetkową, ratę podstawową, nadpłatę oraz sumaryczny koszt w danym miesiącu.
5.  **Darmowy eksport:** Przycisk umożliwiający pobranie pełnego harmonogramu jako plik CSV, w pełni sformatowany pod arkusze kalkulacyjne Excel (z polskimi separatorami).
6.  **Wizualizacja graficzna (Chart.js):**
    *   Wykres skumulowany roczny (koszty kapitałowe, odsetkowe i nadpłaty).
    *   Wykres liniowy porównujący tempo spłaty zadłużenia (porównanie ścieżki z nadpłatami vs. bez nadpłat).
7.  **Dymki edukacyjne:** Wyjaśnienia pojęć finansowych (WIBOR, marża, kapitał) po najechaniu na ikonę informacyjną `(i)`.
8.  **Analiza Wpływu Zmiany Wskaźnika (Symulacja Scenariuszy):**
    *   Automatyczne (reaktywne) wyliczanie wpływu wahań stóp procentowych i wskaźników referencyjnych na wysokość rat i sumaryczne koszty kredytu bezpośrednio po zmianie parametrów w pierwszej zakładce.
    *   Prezentacja wyników za pomocą czytelnego wykresu porównawczego (Chart.js) oraz panelu kart scenariuszy (Base, +1 p.p., +2 p.p., +3 p.p., -1 p.p.).
    *   Wskaźnik wrażliwości budżetu na zmianę stóp o każdy 1 p.p.
9.  **Analiza Inwestycyjna (Inwestowanie vs. Nadpłacanie):**
    *   Matematyczne porównanie opłacalności nadpłacania kredytu (z oszczędnością odsetek) z alternatywnym inwestowaniem tych samych środków (np. obligacje, lokaty, fundusze ETF) na oczekiwany roczny procent składany.
    *   Automatyczne uwzględnienie 19% podatku Belki (od zysków kapitałowych w Polsce) po włączeniu dedykowanej opcji.
    *   Prezentacja wyników majątku netto na koniec spłaty kredytu oraz wykres liniowy przedstawiający wzrost kapitału w czasie dla obu strategii.
    *   Automatycznie generowana pisemna rekomendacja finansowa z czytelnym zestawieniem stóp procentowych dla laika (Koszt kredytu vs Realny zysk z lokaty) oraz wyliczeniem czystej korzyści majątkowej (różnica netto jako zawsze dodatnia wartość ze znakiem `+`).
    *   Wbudowany mechanizm wykrywania braku nadpłat z czytelnym komunikatem zachęcającym do ich zdefiniowania.
10. **Porządkujący System Zakładek (Sidebar Tabs):**
    *   Sidebar podzielony na trzy przejrzyste karty: *Kredyt i nadpłaty*, *Wpływ zmiany wskaźnika* oraz *Analiza inwestycyjna*.
    *   Płynne przełączanie widoków bez utraty wpisanych parametrów, z ciemniejszym wyróżnieniem aktywnej zakładki dla lepszej czytelności.

---

## Struktura Folderów Projektu

Aplikacja została zaprojektowana w sposób modułowy, a na koniec zunifikowana do jednego pliku, aby zapewnić poprawne lokalne działanie bez blokad bezpieczeństwa w przeglądarkach:

```text
mój-kalkulator-kredytowy/
├── index.html                  # Główny szkielet i struktura interfejsu użytkownika
├── README.md                   # Niniejsza dokumentacja techniczna i użytkowa
├── PROPOSALS.md                # Kierunki rozwoju i propozycje rozbudowy aplikacji
├── css/
│   ├── variables.css          # Zmienne CSS, kolory budzące zaufanie, typografia
│   ├── main.css               # Reset stylów, globalne reguły układu i powiadomienia (toast)
│   ├── calculator.css         # Style formularzy wejściowych, suwaków i przełączników
│   ├── dashboard.css          # Style paneli KPI, paska podziału kapitał/odsetki
│   ├── schedule.css           # Stylizacja tabeli amortyzacyjnej, paginacji i modali
│   ├── stress-test.css        # Style dla modułu stres-testów stóp procentowych
│   ├── tabs.css               # [NOWY] Style dla porządkującego paska zakładek
│   └── investment.css         # [NOWY] Style dla modułu analizy inwestycyjnej
└── js/
    ├── app.js                 # [GŁÓWNY] Zunifikowany skrypt całej aplikacji (działa offline i przez file://)
    # Poniższe pliki to oryginalne moduły, zachowane dla czytelności i łatwości utrzymania:
    ├── main.js                # Koordynator zdarzeń i stan wejściowy
    ├── calculator.js          # Silnik obliczeń finansowych (raty, nadpłaty)
    ├── wiborService.js        # Pobieranie stawek live z gpwbenchmark.pl przez proxy
    ├── chartRenderer.js       # Rysowanie wykresów w Chart.js
    └── domHelpers.js          # Pomocnicze funkcje renderujące i formatujące (PLN/Daty)
```

---

## Matematyka Finansowa Kredytu

### Raty równe (Annuitetowe)
Kalkulator wyznacza wysokość raty równej $A$ na podstawie wzoru:
$$A = S \cdot \frac{r(1+r)^n}{(1+r)^n - 1}$$

Gdzie:
*   $S$ – kwota kredytu (kapitał pozostały do spłaty),
*   $r$ – miesięczna stopa procentowa: $r = \frac{\text{WIBOR} + \text{marża}}{12 \cdot 100}$,
*   $n$ – liczba pozostałych rat (miesięcy).

### Podział raty w miesiącu $t$:
1.  **Część odsetkowa:**
    $$I_t = S_{t-1} \cdot r$$
2.  **Część kapitałowa standardowa:**
    $$C_t = A - I_t$$
3.  **Wpływ nadpłaty $O_t$:**
    Nowe saldo zadłużenia na koniec miesiąca wynosi:
    $$S_t = S_{t-1} - (C_t + O_t)$$

---

## Architektura i Działanie Aplikacji

Aplikacja opiera się na architekturze typu **Zero-Server SPA** – działa w 100% po stronie przeglądarki użytkownika.

### 1. Podział i Organizacja Kodu JavaScript (`js/app.js`)
Główna logika aplikacji została zunifikowana w jednym pliku `js/app.js`, aby wyeliminować blokady CORS w przeglądarkach przy uruchomieniu przez protokół `file://`. Logika ta dzieli się na sekcje:
*   **Globalny Stan (`state` i `stressState`)**: Przechowuje aktualny tryb oprocentowania, listę zdefiniowanych nadpłat jednorazowych, pobrane stawki WIBOR, harmonogram zmian stóp w kolejnych latach dla stres-testu oraz parametry analizy inwestycyjnej.
*   **WIBOR Service**: Pobiera stawki live z GPW Benchmark (przez 3 kaskadowe serwery proxy CORS) z automatycznym fallbackiem offline.
*   **Silnik Matematyczny (`generateMortgageSchedules`)**: Wylicza harmonogramy spłaty kredytu w dwóch wariantach równolegle (bez nadpłat oraz z nadpłatami) na podstawie wzoru na raty annuitetowe (równe).
*   **Moduł Analizy Wpływu Zmiany Wskaźnika**: Uruchamia symulację dla scenariuszy statycznych oraz scenariusza dynamicznego. Wylicza ratę oraz skumulowane odsetki dla każdego wariantu i generuje dwuosiowy wykres.
*   **Moduł Analizy Inwestycyjnej**: Oblicza porównawczy wzrost majątku netto dla wariantu regularnego inwestowania nadpłat vs. nadpłacania kredytu i późniejszego inwestowania uwolnionych rat.
*   **System Zakładek (Tabs)**: Kontroluje ukrywanie/pokazywanie odpowiednich sekcji formularza bocznego w zależności od wybranej zakładki bez utraty danych formularza.

### 2. Rozwiązanie Problemu CORS dla Plików Lokalnych
Przy próbie wczytania pliku z konfiguracją testową (`js/test-config.json`) przez protokół `file://`, przeglądarki mogą rzucić błąd CORS. Aby przycisk **„⚡ Wczytaj moje dane”** działał zawsze niezawodnie, wdrożono mechanizm awaryjny:
*   Funkcja `checkAndEnableTestData()` próbuje pobrać plik konfiguracyjny z dysku.
*   Jeżeli przeglądarka zablokuje zapytanie `fetch()`, kod przechwytuje wyjątek i wstrzykuje do formularza wbudowaną, zapasową konfigurację danych testowych.

### 3. Matematyka Porównawcza w Analizie Inwestycyjna
Analiza inwestycyjna porównuje dwa scenariusze w tym samym horyzoncie czasowym $T$ (nominalny czas spłaty kredytu bez nadpłat):
*   **Wariant A (Tylko Inwestowanie)**: Płacimy raty kredytu zgodnie z harmonogramem bazowym (bez nadpłat). Kwoty planowanych nadpłat (stałe miesięczne i jednorazowe) są w całości wpłacane na konto inwestycyjne, które rośnie o procent składany (roczna oczekiwana stopa zwrotu $r_{inv}$ pomniejszona o 19% podatku Belki, jeśli włączono). Wartość końcowa portfela to $V_{inv}$.
*   **Wariant B (Nadpłacanie kredytu)**: Nadpłacamy kredyt zgodnie z planem, spłacając go wcześniej w miesiącu $T_{nadp}$. Od miesiąca $T_{nadp} + 1$ do końca okresu $T$ uwolniona rata kredytu (której nie musimy już płacić bankowi) w całości trafia na konto inwestycyjne z tym samym oprocentowaniem. Wartość końcowa portfela to $V_{overpay}$.
*   Bezpośrednie porównanie $V_{overpay}$ oraz $V_{inv}$ wskazuje, która strategia jest bardziej opłacalna i o ile PLN zwiększy majątek netto użytkownika na koniec nominalnego okresu spłaty.

---

## Jak Uruchomić Projekt

### Metoda 1: Bezpośrednie uruchomienie (Najprostsza)
Wystarczy dwukrotnie kliknąć plik `index.html` bezpośrednio na dysku komputera. Aplikacja otworzy się w przeglądarce i będzie w pełni funkcjonalna (zarówno obliczenia, wykresy, jak i pobieranie stawek WIBOR).
*(Dzięki zunifikowaniu logiki do pliku `js/app.js`, przeglądarka nie blokuje skryptów regułami CORS dla lokalnego protokołu `file://`)*.

### Metoda 2: Lokalny serwer (Opcjonalna)
Możesz również serwować pliki przez serwer HTTP:
*   **Node.js / npm:**
    ```bash
    npx live-server
    ```
*   **Python:**
    ```bash
    python -m http.server 8000
    ```
    A następnie otwórz w przeglądarce adres `http://localhost:8000`.

---

## Licencja i Źródła Danych
*   Wykresy: Inicjalizowane przy użyciu darmowej biblioteki [Chart.js](https://www.chartjs.org/) na licencji MIT.
*   Dane WIBOR: Prawa autorskie do wskaźników WIBID i WIBOR należą do administratora wskaźników referencyjnych – **GPW Benchmark S.A.**
