# US News rank fact-check: law-school-picker (as of 2026-10-21)

## Which edition

- **The site's ranks match the 2025-2026 edition, released April 2025.** US News labels it "2025-2026"; the brief calls it the "2026" edition. Of the 189 schools that US News lists, 188 match exactly. The one mismatch is Southern University Law Center. Rutgers and Widener Commonwealth are also off because the site has them as `None`.
- **That edition is no longer current.** The **2026-2027 edition** came out in early April 2026. TaxProf Blog posted the full list on 2026-04-07, and the ranking data is dated March 12, 2026. It covers 194 schools: 174 have numeric ranks (the lowest is a tie at #171) and 20 are unranked, which US News displays as "#175-194".
- **Almost every rank is now out of date.** Of the 186 site schools that have a numeric rank in both editions, only 8 have the same number in 2026-27. Using the site's own brackets, **42 schools change tier** (41 in the TaxProf-based count, plus Loyola Chicago after the usnews.com correction). The appendix lists them all.
  - Georgetown (18), Texas (16) and Berkeley (16) drop out of the T14.
  - Cornell (13) moves into the T14.
  - Miami jumps from 92 to 70.
- Sources for the 2025-26 edition:
  - Full list: TaxProf "2025-26 U.S. News Law School Peer Reputation Rankings (And Overall Rankings)", https://taxprofblog.aals.org/?p=49496
  - Second check: TaxProf "2025-26 Omnibus Specialty v. Overall", https://taxprofblog.aals.org/2025/04/25/2025-26-us-news-omnibus-specialty-rankings-v-overall-rankings/. Its overall ranks for 100 schools agree with the full list everywhere except the unranked placeholder.
- Sources for the 2026-27 edition:
  - Full list: TaxProf, https://taxprofblog.aals.org/2026/04/07/2026-27-u-s-news-law-school-peer-reputation-rankings-and-overall-rankings/
  - US News school page confirming the "175-194 of 194" unranked band: https://www.usnews.com/best-graduate-schools/top-law-schools/southern-university-law-center-03067
  - The T14 changes are also reported at https://lsatdemon.com/resources/law-school-news/us-news-rankings-2026

### How the site handles unranked schools (the 16 schools at "178")
- In 2025-26, 178 schools had numeric ranks (the last tie was #175) and 17 had no published rank. The site carries 15 of those 17; the other two are Puerto Rico schools. TaxProf marks them "Tier 2", and its omnibus table places them at **179**, not 178. That matches US News's convention of showing them as "#179-195", the same way 2026-27 shows "#175-194".
- 15 of the 16 site schools at 178 really were unranked, so the placeholder is fine for sorting, but it should read as "unranked" (or 179), not as a real rank.
- **The 16th, Southern University Law Center, was actually ranked #175.** It drops to unranked in 2026-27.
- If the site moves to 2026-27, the placeholder should become 175, or better, null plus an "unranked" label.

## Errors found (against the 2025-26 edition the site uses, unless noted)

| School | Site value | Correct value | Source | Confidence |
|---|---|---|---|---|
| Southern University Law Center | rank 178 (unranked) | **#175** (2025-26). Unranked in 2026-27. | https://taxprofblog.aals.org/?p=49496 ; https://taxprofblog.aals.org/2025/04/25/2025-26-us-news-omnibus-specialty-rankings-v-overall-rankings/ | high |
| Rutgers Law School | rank None, tier T100 | **#104** (2025-26), so tier **Regional**. **#100** in 2026-27, so T100. Rutgers is one merged school that US News ranks. | same two TaxProf 2025-26 tables ; 2026-27: https://taxprofblog.aals.org/2026/04/07/2026-27-u-s-news-law-school-peer-reputation-rankings-and-overall-rankings/ | high |
| Rutgers Law School | city Camden | One school with two locations, Newark and Camden (merged 2015; co-deans, one per city). "Camden" alone is incomplete; Newark is the larger location. | https://njbiz.com/rutgers-law-school-names-co-dean-for-camden-location/ | med |
| Widener University Commonwealth Law School | rank None | **#175** (2025-26). Unranked in 2026-27. The tier (Regional) is correct either way. | https://taxprofblog.aals.org/?p=49496 ; omnibus table above | high |
| Wilmington University School of Law | name | Renamed **Farnan School of Law (Wilmington University)** on 2026-05-01. Its rank of None is correct: it has provisional ABA approval and is not in either US News list. City Wilmington is correct (30 Beaver Valley Rd). | https://blog.wilmu.edu/news/2026/05/04/wilmington-university-names-farnan-school-of-law/ ; https://law.wilmu.edu/admission/index.aspx | high |
| Mississippi College School of Law | name | **Mississippi Christian University School of Law**, effective 2026-06-01 (still branded "MC Law") | https://www.wjtv.com/news/education/mississippi-college-officially-becomes-mississippi-christian-university/amp/ ; https://mississippitoday.org/2026/06/22/name-change-alumni-mississippi-college/ | high |
| University of Cincinnati Law School | name | **Donald P. Klekamp College of Law**. Trustees approved it 2026-03-30 after a $43.2M gift. | https://taxprofblog.aals.org/2026/04/03/with-42-3-million-gift-university-of-cincinnati-college-of-law-renamed-donald-p-klekamp-college-of-law ; https://www.uc.edu/news/articles/2026/04/n21399103.html | high |
| Western Michigan University Cooley Law School | name | **Thomas M. Cooley Law School**. The WMU affiliation ended in November 2023 and the WMU name was dropped. | https://cooley.edu/news/cooley-and-wmu-end-10-year-affiliation | high |
| Southern Illinois University School of Law | name | **SIU Simmons Law School** (since August 2024) | https://news.siu.edu/2024/08/081624-siu-simmons-law-school-unveils-new-name-honors-donor.php | high |
| University of South Dakota Law School | name | **University of South Dakota Knudson School of Law** (since 2020) | https://www.usd.edu/the-south-dakotan/usd-law-school-receives-historic-gift---honors-david-knudson-with-renaming | high |
| Cleveland State Cleveland-Marshall College of Law | name | **Cleveland State University College of Law**. The "Cleveland-Marshall" name was dropped by a vote on 2022-11-17. | https://www.csuohio.edu/news/csu-remove-cleveland-marshall-name-from-college-law | high |
| Sandra Day O'Connor College of Law | city Tempe | **Phoenix**: Beus Center for Law and Society on the Downtown Phoenix campus, since 2016 | https://lawlib.asu.edu/about/location | high |
| Antonin Scalia Law School, George Mason University | city Fairfax | **Arlington**: 3301 Fairfax Drive, Arlington VA 22201 | https://law.gmu.edu/about/directions | high |
| Ave Maria School of Law | city Ave Maria | **Naples**: 1025 Commons Circle, Naples FL 34119 | https://studyinthestates.dhs.gov/certified-school/101867 | high |

**Tier check against 2025-26:** Rutgers is the only school whose tier conflicts with its correct rank (T100 should be Regional). Every other school's tier matches its 2025-26 rank under the site's brackets.

**Schools using the median-LSAT fallback** because US News doesn't rank them:
- Wilmington/Farnan: Regional.
- Jacksonville University College of Law: T100. It has provisional ABA approval (Feb 2024) and is not in either US News list, so a "T100" label for an unranked school may mislead users.
- Under 2025-26, Rutgers and Widener Commonwealth should *not* be on the fallback, because both were ranked.

Minor naming and location issues I didn't put in the table:
- Notre Dame's postal city is "Notre Dame, IN", not South Bend.
- Montana's full name is the Alexander Blewett III School of Law (a 2015 naming, not recent).
- The University of Maine's official name is "University of Maine School of Law".
- Penn State Law (University Park) was ranked #68 in 2025-26, is gone from the 2026-27 list, and isn't on the site at all. That may be intentional.

## Could not verify
- **Every rank comes from secondary sources.** usnews.com timed out when fetched directly, so each 2025-26 and 2026-27 rank was read from TaxProf Blog's reposted full lists, not from usnews.com itself. Southern's 2026-27 band is the only rank also confirmed on a usnews.com page.
- I did not separately confirm whether US News's own 2025-26 pages displayed the unranked band as "#179-195" or "#178-195". The inference comes from TaxProf's placeholder of 179 and the 2026-27 "#175-194" display.
- I checked city and official name for every school from my own knowledge. I looked up sources only for the ones flagged above, plus Wilmington and Rutgers. The other ~180 city and name values are unverified by source but showed no red flags.

## Count
**190 of 193** site rank values are correct against the 2025-26 edition: 173 numeric ranks, 15 genuinely unranked "178" placeholders, and 2 correct `None` values (Wilmington, Jacksonville). The three wrong ones are Southern University, Rutgers and Widener Commonwealth. Measured against the current 2026-27 edition, only 8 numeric ranks are still the same.

## Appendix: site value vs current 2026-27 edition (for the update)
Source: https://taxprofblog.aals.org/2026/04/07/2026-27-u-s-news-law-school-peer-reputation-rankings-and-overall-rankings/

Changes in ranked/unranked status:
- Newly ranked in 2026-27: Thomas Goode Jones/Faulkner (164), St. Thomas FL (168), Charleston (171).
- Newly unranked in 2026-27: Southern Illinois, Capital, Widener Commonwealth, Lincoln Memorial, Southern.

| School | Site rank (2025-26) | Site tier | 2026-27 rank | 2026-27 tier |
|---|---|---|---|---|
| University of Alabama School of Law | 31 | T50 | 40 | T50 |
| Cumberland School of Law | 107 | Regional | 122 | Regional |
| Thomas Goode Jones School of Law | 178 | Regional | 164 | Regional |
| Sandra Day O'Connor College of Law | 45 | T50 | 44 | T50 |
| University of Arizona James E. Rogers College of Law | 59 | T60 | 70 | T70 |
| University of Arkansas Law School | 115 | Regional | 100 | T100 |
| University of Arkansas at Little Rock Bowen School of Law | 139 | Regional | 140 | Regional |
| Stanford Law School | 1 | T14 | 1 | T14 |
| UCLA School of Law | 12 | T14 | 13 | T14 |
| UC Berkeley School of Law | 13 | T14 | 16 | T20 |
| USC Gould School of Law | 26 | T30 | 26 | T30 |
| UC Irvine School of Law | 38 | T50 | 34 | T50 |
| UC Davis School of Law | 50 | T50 | 52 | T60 |
| Pepperdine Caruso School of Law | 55 | T60 | 46 | T50 |
| University of San Diego School of Law | 57 | T60 | 54 | T60 |
| Loyola Law School | 71 | T80 | 70 | T70 |
| UC Law San Francisco | 88 | T90 | 85 | T90 |
| Chapman University Fowler School of Law | 104 | Regional | 112 | Regional |
| Southwestern Law School | 154 | Regional | 161 | Regional |
| Santa Clara University School of Law | 156 | Regional | 150 | Regional |
| Pacific McGeorge School of Law | 163 | Regional | 152 | Regional |
| University of San Francisco School of Law | 166 | Regional | 156 | Regional |
| California Western School of Law | 178 | Regional | unranked (#175-194) | (LSAT fallback) |
| Western State College of Law | 178 | Regional | unranked (#175-194) | (LSAT fallback) |
| University of Colorado Law School | 46 | T50 | 54 | T60 |
| University of Denver Sturm College of Law | 88 | T90 | 91 | T100 |
| Yale Law School | 1 | T14 | 2 | T14 |
| University of Connecticut School of Law | 50 | T50 | 58 | T60 |
| Quinnipiac University School of Law | 141 | Regional | 136 | Regional |
| Widener University Delaware Law School | 169 | Regional | 154 | Regional |
| Georgetown University Law Center | 14 | T14 | 18 | T20 |
| George Washington University Law School | 31 | T50 | 26 | T30 |
| Columbus School of Law, Catholic University | 71 | T80 | 70 | T70 |
| American University Washington College of Law | 104 | Regional | 108 | Regional |
| Howard University School of Law | 127 | Regional | 117 | Regional |
| UDC David A. Clarke School of Law | 178 | Regional | unranked (#175-194) | (LSAT fallback) |
| Florida State University College of Law | 38 | T50 | 34 | T50 |
| University of Florida Levin College of Law | 38 | T50 | 34 | T50 |
| Florida International University College of Law | 84 | T90 | 77 | T80 |
| University of Miami School of Law | 92 | T100 | 70 | T70 |
| Stetson University College of Law | 99 | T100 | 91 | T100 |
| Ave Maria School of Law | 153 | Regional | 164 | Regional |
| Barry University Dwayne O. Andreas School of Law | 178 | Regional | unranked (#175-194) | (LSAT fallback) |
| Florida A&M University College of Law | 178 | Regional | unranked (#175-194) | (LSAT fallback) |
| Nova Southeastern University Shepard Broad | 178 | Regional | unranked (#175-194) | (LSAT fallback) |
| St. Thomas University College of Law | 178 | Regional | 168 | Regional |
| University of Georgia School of Law | 22 | T30 | 26 | T30 |
| Emory University School of Law | 38 | T50 | 40 | T50 |
| Georgia State University College of Law | 79 | T80 | 77 | T80 |
| Mercer University School of Law | 107 | Regional | 108 | Regional |
| Atlanta's John Marshall Law School | 178 | Regional | unranked (#175-194) | (LSAT fallback) |
| University of Hawai'i at Manoa William S. Richardson School of Law | 99 | T100 | 91 | T100 |
| University of Idaho College of Law | 141 | Regional | 148 | Regional |
| University of Chicago Law School | 3 | T14 | 2 | T14 |
| Northwestern Pritzker School of Law | 10 | T14 | 9 | T14 |
| University of Illinois College of Law | 48 | T50 | 46 | T50 |
| Loyola University Chicago School of Law | 79 | T80 | **70** (TaxProf list said 77; usnews.com shows 70) | **T70** |
| Chicago-Kent College of Law | 107 | Regional | 105 | Regional |
| DePaul University College of Law | 133 | Regional | 131 | Regional |
| Northern Illinois University College of Law | 150 | Regional | 161 | Regional |
| UIC School of Law | 169 | Regional | 167 | Regional |
| Southern Illinois University School of Law | 175 | Regional | unranked (#175-194) | (LSAT fallback) |
| Notre Dame Law School | 20 | T20 | 20 | T20 |
| Indiana University Maurer School of Law | 46 | T50 | 49 | T50 |
| Indiana University McKinney School of Law | 107 | Regional | 124 | Regional |
| University of Iowa College of Law | 36 | T50 | 32 | T50 |
| Drake University Law School | 84 | T90 | 91 | T100 |
| University of Kansas School of Law | 50 | T50 | 46 | T50 |
| Washburn University School of Law | 121 | Regional | 108 | Regional |
| University of Kentucky Rosenberg College of Law | 68 | T70 | 70 | T70 |
| NKU Salmon P. Chase College of Law | 134 | Regional | 131 | Regional |
| University of Louisville Brandeis School of Law | 146 | Regional | 124 | Regional |
| Tulane University Law School | 71 | T80 | 70 | T70 |
| LSU Paul M. Hebert Law Center | 84 | T90 | 85 | T90 |
| Loyola University New Orleans College of Law | 134 | Regional | 135 | Regional |
| Southern University Law Center | 178 | Regional | unranked (#175-194) | (LSAT fallback) |
| University of Maine Law School | 88 | T90 | 91 | T100 |
| University of Maryland Francis King Carey | 63 | T70 | 62 | T70 |
| University of Baltimore School of Law | 139 | Regional | 136 | Regional |
| Harvard Law School | 6 | T14 | 6 | T14 |
| Boston University School of Law | 22 | T30 | 24 | T30 |
| Boston College Law School | 25 | T30 | 20 | T20 |
| Northeastern University School of Law | 68 | T70 | 77 | T80 |
| Suffolk University Law School | 127 | Regional | 128 | Regional |
| UMass Law - Dartmouth | 161 | Regional | 171 | Regional |
| New England Law Boston | 166 | Regional | 168 | Regional |
| Western New England University School of Law | 166 | Regional | 159 | Regional |
| University of Michigan Law School | 8 | T14 | 9 | T14 |
| Wayne State University Law School | 71 | T80 | 62 | T70 |
| Michigan State University College of Law | 115 | Regional | 108 | Regional |
| University of Detroit Mercy School of Law | 134 | Regional | 142 | Regional |
| Western Michigan University Cooley Law School | 178 | Regional | unranked (#175-194) | (LSAT fallback) |
| University of Minnesota Law School | 20 | T20 | 22 | T30 |
| University of St. Thomas School of Law | 94 | T100 | 105 | Regional |
| Mitchell Hamline School of Law | 154 | Regional | 152 | Regional |
| University of Mississippi School of Law | 121 | Regional | 124 | Regional |
| Mississippi College School of Law | 158 | Regional | 161 | Regional |
| Washington University School of Law | 14 | T14 | 13 | T14 |
| University of Missouri School of Law | 57 | T60 | 59 | T60 |
| Saint Louis University School of Law | 94 | T100 | 91 | T100 |
| UMKC School of Law | 99 | T100 | 100 | T100 |
| University of Montana Law School | 99 | T100 | 90 | T90 |
| University of Nebraska Law School | 71 | T80 | 62 | T70 |
| Creighton University School of Law | 148 | Regional | 144 | Regional |
| William S. Boyd School of Law at UNLV | 79 | T80 | 91 | T100 |
| University of New Hampshire Franklin Pierce School of Law | 125 | Regional | 136 | Regional |
| Seton Hall University School of Law | 71 | T80 | 70 | T70 |
| Rutgers Law School | None | T100 | 100 | T100 |
| University of New Mexico School of Law | 107 | Regional | 117 | Regional |
| New York University School of Law | 8 | T14 | 7 | T14 |
| Columbia Law School | 10 | T14 | 9 | T14 |
| Cornell Law School | 18 | T20 | 13 | T14 |
| Fordham University School of Law | 38 | T50 | 42 | T50 |
| Benjamin N. Cardozo School of Law | 63 | T70 | 59 | T60 |
| St. John's University School of Law | 63 | T70 | 62 | T70 |
| University at Buffalo School of Law (SUNY) | 94 | T100 | 82 | T90 |
| Syracuse University College of Law | 107 | Regional | 100 | T100 |
| Albany Law School | 117 | Regional | 120 | Regional |
| Brooklyn Law School | 117 | Regional | 105 | Regional |
| New York Law School | 121 | Regional | 112 | Regional |
| Hofstra University Maurice A. Deane | 125 | Regional | 117 | Regional |
| Pace University Elisabeth Haub School of Law | 141 | Regional | 142 | Regional |
| CUNY School of Law | 156 | Regional | 171 | Regional |
| Touro University Jacob D. Fuchsberg Law Center | 169 | Regional | 164 | Regional |
| Duke University School of Law | 6 | T14 | 7 | T14 |
| UNC School of Law | 18 | T20 | 18 | T20 |
| Wake Forest University School of Law | 26 | T30 | 30 | T30 |
| Campbell University School of Law | 134 | Regional | 131 | Regional |
| Elon University School of Law | 158 | Regional | 144 | Regional |
| North Carolina Central University School of Law | 178 | Regional | unranked (#175-194) | (LSAT fallback) |
| University of North Dakota School of Law | 161 | Regional | 156 | Regional |
| Ohio State Moritz College of Law | 28 | T30 | 30 | T30 |
| University of Cincinnati Law School | 71 | T80 | 82 | T90 |
| Case Western Reserve University School of Law | 107 | Regional | 100 | T100 |
| University of Dayton School of Law | 107 | Regional | 112 | Regional |
| Cleveland State Cleveland-Marshall College of Law | 121 | Regional | 136 | Regional |
| University of Akron School of Law | 127 | Regional | 131 | Regional |
| University of Toledo Law School | 150 | Regional | 149 | Regional |
| Capital University Law School | 174 | Regional | unranked (#175-194) | (LSAT fallback) |
| Ohio Northern University Pettit College of Law | 178 | Regional | unranked (#175-194) | (LSAT fallback) |
| University of Oklahoma Law School | 59 | T60 | 62 | T70 |
| University of Tulsa College of Law | 127 | Regional | 120 | Regional |
| Oklahoma City University School of Law | 158 | Regional | 156 | Regional |
| University of Oregon School of Law | 94 | T100 | 91 | T100 |
| Lewis & Clark Law School | 99 | T100 | 112 | Regional |
| Willamette University College of Law | 150 | Regional | 168 | Regional |
| University of Pennsylvania Carey Law School | 5 | T14 | 4 | T14 |
| Villanova University Charles Widger School of Law | 48 | T50 | 49 | T50 |
| Temple University Beasley School of Law | 50 | T50 | 49 | T50 |
| Penn State Dickinson Law | 59 | T60 | 62 | T70 |
| Drexel University Thomas R. Kline School of Law | 79 | T80 | 82 | T90 |
| University of Pittsburgh School of Law | 79 | T80 | 77 | T80 |
| Duquesne University Kline School of Law | 92 | T100 | 85 | T90 |
| Widener University Commonwealth Law School | None | Regional | unranked (#175-194) | (LSAT fallback) |
| Roger Williams University School of Law | 169 | Regional | 171 | Regional |
| University of South Carolina School of Law | 63 | T70 | 62 | T70 |
| Charleston School of Law | 178 | Regional | 171 | Regional |
| University of South Dakota Law School | 127 | Regional | 122 | Regional |
| Vanderbilt Law School | 14 | T14 | 12 | T14 |
| University of Tennessee College of Law | 55 | T60 | 57 | T60 |
| Belmont University College of Law | 84 | T90 | 85 | T90 |
| University of Memphis Cecil C. Humphreys | 146 | Regional | 140 | Regional |
| Lincoln Memorial University Duncan School of Law | 169 | Regional | unranked (#175-194) | (LSAT fallback) |
| University of Texas School of Law | 14 | T14 | 16 | T20 |
| Texas A&M School of Law | 22 | T30 | 22 | T30 |
| Baylor Law School | 43 | T50 | 34 | T50 |
| SMU Dedman School of Law | 43 | T50 | 42 | T50 |
| University of Houston Law Center | 63 | T70 | 54 | T60 |
| Texas Tech University School of Law | 88 | T90 | 85 | T90 |
| South Texas College of Law Houston | 138 | Regional | 128 | Regional |
| St. Mary's University School of Law | 148 | Regional | 150 | Regional |
| UNT Dallas College of Law | 163 | Regional | 159 | Regional |
| Texas Southern University Thurgood Marshall | 178 | Regional | unranked (#175-194) | (LSAT fallback) |
| BYU J. Reuben Clark Law School | 28 | T30 | 24 | T30 |
| University of Utah Law School | 31 | T50 | 44 | T50 |
| Vermont Law and Graduate School | 163 | Regional | 154 | Regional |
| University of Virginia School of Law | 4 | T14 | 4 | T14 |
| Antonin Scalia Law School, George Mason University | 31 | T50 | 32 | T50 |
| William & Mary Law School | 31 | T50 | 34 | T50 |
| Washington and Lee University School of Law | 36 | T50 | 34 | T50 |
| University of Richmond School of Law | 71 | T80 | 62 | T70 |
| Regent University School of Law | 94 | T100 | 91 | T100 |
| Liberty University School of Law | 141 | Regional | 144 | Regional |
| Appalachian School of Law | 178 | Regional | unranked (#175-194) | (LSAT fallback) |
| University of Washington School of Law | 50 | T50 | 52 | T60 |
| Seattle University School of Law | 127 | Regional | 128 | Regional |
| Gonzaga University School of Law | 141 | Regional | 144 | Regional |
| West Virginia University College of Law | 117 | Regional | 124 | Regional |
| University of Wisconsin Law School | 28 | T30 | 26 | T30 |
| Marquette University Law School | 59 | T60 | 59 | T60 |
| University of Wyoming Law School | 117 | Regional | 112 | Regional |
