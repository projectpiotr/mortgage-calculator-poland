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

---

## Struktura Folderów Projektu

Aplikacja została zaprojektowana w sposób modułowy, a na koniec zunifikowana do jednego pliku, aby zapewnić poprawne lokalne działanie bez blokad bezpieczeństwa w przeglądarkach:

```text
mój-kalkulator-kredytowy/
├── index.html                  # Główny szkielet i struktura interfejsu użytkownika
├── README.md                   # Niniejsza dokumentacja techniczna i użytkowa
├── css/
│   ├── variables.css          # Zmienne CSS, kolory budzące zaufanie, typografia
│   ├── main.css               # Reset stylów, globalne reguły układu i powiadomienia (toast)
│   ├── calculator.css         # Style formularzy wejściowych, suwaków i przełączników
│   ├── dashboard.css          # Style paneli KPI, paska podziału kapitał/odsetki
│   └── schedule.css           # Stylizacja tabeli amortyzacyjnej, paginacji i modali
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
