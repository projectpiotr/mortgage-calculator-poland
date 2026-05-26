# Kierunki Rozwoju Aplikacji - Kalkulator Kredytowy

Poniżej zebrano propozycje rozbudowy aplikacji, które pozwolą przekształcić ją w kompletne narzędzie planowania finansowego dla kredytobiorców w Polsce.

---

## 1. [✓] Symulator Zmian Stóp Procentowych (Testy Warunków Skrajnych) — *ZREALIZOWANO*
*   **Opis:** WIBOR ulega ciągłym wahaniom. Wdrożenie testu warunków skrajnych pozwala sprawdzić odporność budżetu domowego na zmiany stóp procentowych w przyszłości.
*   **Funkcje:**
    *   [✓] Porównanie symulacji: Scenariusz bazowy, WIBOR +1 p.p., +2 p.p., +3 p.p. oraz spadek o 1 p.p.
    *   [✓] Dynamiczny harmonogram stóp: Definiowanie stawek WIBOR w rozbiciu na konkretne lata.
    *   [✓] Analiza wrażliwości: Wykres dual-axis (Chart.js) oraz wskaźniki wzrostu raty na każdy 1 p.p. zmiany stóp.
*   **Wartość:** Pokazuje, jak nadpłaty obniżają wrażliwość raty na przyszłe podwyżki stóp procentowych.

## 2. Analiza Inwestycyjna: Inwestowanie vs. Nadpłacanie
*   **Opis:** Częsty dylemat finansowy: *„Czy nadpłacać kredyt oprocentowany na X%, czy odkładać te same środki na lokatę/ETF-y zarabiające Y%?”*.
*   **Funkcje:**
    *   Wprowadzenie oczekiwanej rocznej stopy zwrotu z alternatywnej inwestycji.
    *   Automatyczne uwzględnienie 19% podatku Belki dla zysków kapitałowych w Polsce.
    *   Zestawienie skumulowanych zysków z inwestycji vs. oszczędności odsetkowych z nadpłat.
*   **Wartość:** Pomaga podjąć racjonalną, matematycznie uzasadnioną decyzję o alokacji wolnego kapitału.

## 3. Koszty Okołokredytowe i Pełne RRSO
*   **Opis:** Oprocentowanie to nie jedyny koszt kredytu. Banki często nakładają dodatkowe opłaty, które znacząco podnoszą koszt spłaty.
*   **Funkcje:**
    *   Definiowanie ubezpieczenia na życie (np. stałe lub malejące wraz z saldem zadłużenia).
    *   Ubezpieczenie pomostowe (naliczane do momentu wpisu do księgi wieczystej).
    *   Opłaty jednorazowe (prowizja za udzielenie kredytu, koszt wyceny, podatki PCC).
    *   Precyzyjne wyliczanie rzeczywistej rocznej stopy oprocentowania (RRSO).
*   **Wartość:** Umożliwia rzetelne porównanie ofert z różnych banków.

## 4. Porównywarka Ofert (Zestawienie Side-by-Side)
*   **Opis:** Porównywanie różnych ofert kredytowych lub różnych strategii nadpłat na jednym, wspólnym ekranie.
*   **Funkcje:**
    *   Możliwość zapisania aktualnych parametrów jako „Oferta A” i skonfigurowania „Oferty B”.
    *   Wizualne porównanie na wykresach (tempo spłaty, struktura kosztów) obu wariantów jednocześnie.
*   **Wartość:** Idealne narzędzie przed wizytą u doradcy finansowego lub w banku.

## 5. Kalkulator Celów (Goal Tracker)
*   **Opis:** Odwrócenie logiki kalkulatora — zamiast podawać kwotę nadpłaty, użytkownik podaje pożądany cel.
*   **Funkcje:**
    *   Definiowanie celu, np.: *„Chcę spłacić kredyt przed rokiem X”* lub *„Chcę skrócić okres o dokładnie 8 lat”*.
    *   Automatyczne wyliczanie wymaganej kwoty stałej nadpłaty miesięcznej lub jednorazowej.
*   **Wartość:** Ułatwia planowanie budżetu pod konkretne cele życiowe.

## 6. Wsparcie dla Kredytów z Okresowo Stałą Stopą
*   **Opis:** Kredyty ze stałym oprocentowaniem na 5 lat (60 miesięcy) są obecnie standardem w Polsce.
*   **Funkcje:**
    *   Symulacja podziału kredytu na dwa okresy: okres stałej stopy (np. pierwsze 5 lat na poziomie 6.5%) oraz okres stopy zmiennej (prognozowany WIBOR + marża po 5 latach).
*   **Wartość:** Dokładne odwzorowanie rzeczywistych umów kredytowych zawieranych w ostatnich latach.
