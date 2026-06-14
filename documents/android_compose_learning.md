# Android Compose Learning Guide — Artivaa Project

> **For you (Pulkit):** Java/Kotlin background se Compose + Coroutines strong banane ke liye.  
> **For AI agents:** Koi bhi Android code likhne se **pehle** yeh file padho. Naya pattern add karte waqt is file ko **update** karo with example.

**Pair with:** [`artivaa-android-compose-plan.md`](./artivaa-android-compose-plan.md) + [`artivaa-android-app-design-spec.md`](./artivaa-android-app-design-spec.md)

---

## How to use this guide

1. Sprint ke hisaab se relevant chapter padho (plan file mein link hai).
2. Example copy karke Artivaa screen pe apply karo — `MockData` use karo, API mat lagao (Phase 1).
3. `@Preview` har naye composable ke saath likho — fast iteration.
4. Confusion ho to Android Studio **Layout Inspector** + **Compose Preview** use karo.

---

## Table of contents

1. [Kotlin refresh (Java se aane wale ke liye)](#1-kotlin-refresh)
2. [Compose mental model](#2-compose-mental-model)
3. [Layout: Column, Row, Box, Modifier](#3-layout)
4. [Lists: LazyColumn, LazyRow](#4-lists)
5. [State: remember, mutableStateOf](#5-state)
6. [Dialogs, Bottom sheets, Snackbar](#6-dialogs--sheets)
7. [Tabs, Scaffold, TopAppBar](#7-scaffold--tabs)
8. [UiState pattern (Loading / Success / Error)](#8-uistate-pattern)
9. [Forms, TextField, Switch](#9-forms)
10. [Navigation Compose](#10-navigation)
11. [Theming — Artivaa colors & typography](#11-theming)
12. [Side effects: LaunchedEffect, DisposableEffect](#12-side-effects)
13. [ViewModel + StateFlow](#13-viewmodel--stateflow)
14. [Coroutines basics](#14-coroutines)
15. [Flow — cold streams, collect](#15-flow)
16. [Retrofit + suspend (Phase 2)](#16-retrofit-phase-2)
17. [Hilt dependency injection (Phase 2)](#17-hilt-phase-2)
18. [Testing Compose](#18-testing)
19. [Artivaa-specific patterns](#19-artivaa-patterns)
20. [Common mistakes & fixes](#20-common-mistakes)

---

## 1. Kotlin refresh

### 1.1 Data class vs Java POJO

```kotlin
// Java style (verbose)
data class Meeting(
    val id: String,
    val title: String,
    val status: MeetingStatus,
    val platform: String = "google_meet"
)

enum class MeetingStatus { SCHEDULED, CAPTURING, COMPLETED, FAILED }
```

`copy()` se immutable update:

```kotlin
val updated = meeting.copy(status = MeetingStatus.COMPLETED)
```

### 1.2 Null safety

```kotlin
val name: String? = user.fullName
val display = name ?: "Unknown"           // Elvis
val length = user.email?.length ?: 0        // Safe call
val sure = requireNotNull(token) { "No token" }
```

### 1.3 Sealed class — UI states ke liye best

```kotlin
sealed interface MeetingListUiState {
    data object Loading : MeetingListUiState
    data class Success(val meetings: List<Meeting>) : MeetingListUiState
    data class Error(val message: String) : MeetingListUiState
}
```

`when` exhaustive — compiler har branch check karta hai:

```kotlin
when (state) {
    is MeetingListUiState.Loading -> LoadingSkeleton()
    is MeetingListUiState.Success -> MeetingList(state.meetings)
    is MeetingListUiState.Error -> ErrorState(state.message)
}
```

### 1.4 Extension functions

```kotlin
fun String.toInitials(): String =
    split(" ").mapNotNull { it.firstOrNull()?.uppercase() }.take(2).joinToString("")

// Usage
Text(user.name.toInitials())
```

### 1.5 Scope functions — kab kaunsa

| Function | `this`/`it` | Return | Use |
|----------|-------------|--------|-----|
| `let` | `it` | Lambda result | Null check chain |
| `apply` | `this` | Object itself | Builder / config |
| `also` | `it` | Object itself | Side effect log |
| `run` | `this` | Lambda result | Scoped block |

```kotlin
Modifier
    .fillMaxWidth()
    .padding(16.dp)
    .also { /* debug */ }
```

---

## 2. Compose mental model

### Recomposition

- UI = `@Composable` functions.
- State change → Compose **sirf affected** composables dubara call karta hai.
- Composable ko **side effect mat rakho** (API call directly in composable body — bad).

```kotlin
@Composable
fun Counter() {
    var count by remember { mutableIntStateOf(0) }
    Column {
        Text("Count: $count")
        Button(onClick = { count++ }) { Text("Add") }
    }
}
```

### Rules

1. Composables **pure** jitna ho sake — input → UI.
2. State **up** hoist karo ya ViewModel mein.
3. Heavy work **Composable ke bahar** (ViewModel / LaunchedEffect).

---

## 3. Layout

### Column + Row + Box

```kotlin
@Composable
fun MeetingCard(meeting: Meeting, modifier: Modifier = Modifier) {
    ArtivaaCard(modifier = modifier.fillMaxWidth()) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            PlatformBadge(meeting.platform)
            Column(modifier = Modifier.weight(1f).padding(start = 12.dp)) {
                Text(meeting.title, style = MaterialTheme.typography.titleMedium)
                Text(meeting.scheduledTime, color = ArtivaaColors.TextSecondary)
            }
            StatusChip(meeting.status)
        }
    }
}
```

### Modifier order matters

```kotlin
// Padding THEN background — padding area bhi colored
Modifier
    .fillMaxWidth()
    .clip(RoundedCornerShape(12.dp))
    .background(Color.White)
    .border(1.dp, ArtivaaColors.Border, RoundedCornerShape(12.dp))
    .padding(16.dp)
```

### Spacer & weight

```kotlin
Row(Modifier.fillMaxWidth()) {
    Text("Left")
    Spacer(Modifier.weight(1f))
    Text("Right")
}
```

---

## 4. Lists

### LazyColumn — meetings list

```kotlin
@Composable
fun MeetingsList(meetings: List<Meeting>, onMeetingClick: (String) -> Unit) {
    LazyColumn(
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        items(meetings, key = { it.id }) { meeting ->
            MeetingCard(
                meeting = meeting,
                modifier = Modifier.clickable { onMeetingClick(meeting.id) }
            )
        }
    }
}
```

**`key`** — list update pe performance + animation ke liye zaroori.

### Sticky header (date groups)

```kotlin
LazyColumn {
    meetingsByDate.forEach { (date, items) ->
        stickyHeader { DateHeader(date) }
        items(items, key = { it.id }) { MeetingCard(it) }
    }
}
```

### LazyRow — dashboard stats

```kotlin
LazyRow(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
    items(stats) { stat -> StatCard(stat) }
}
```

---

## 5. State

### remember — configuration survive

```kotlin
var expanded by remember { mutableStateOf(false) }
var searchQuery by remember { mutableStateOf("") }
```

### rememberSaveable — rotation / process death

```kotlin
var tabIndex by rememberSaveable { mutableIntStateOf(0) }
```

### State hoisting

```kotlin
// Child
@Composable
fun SearchBar(query: String, onQueryChange: (String) -> Unit) {
    TextField(value = query, onValueChange = onQueryChange, ...)
}

// Parent owns state
@Composable
fun ReportsScreen() {
    var query by remember { mutableStateOf("") }
    SearchBar(query = query, onQueryChange = { query = it })
    FilteredReportsList(query)
}
```

### derivedStateOf — expensive filter

```kotlin
val filteredItems by remember {
    derivedStateOf {
        items.filter { it.task.contains(searchQuery, ignoreCase = true) }
    }
}
```

---

## 6. Dialogs & sheets

### AlertDialog — delete confirm

```kotlin
@Composable
fun DeleteMeetingDialog(
    visible: Boolean,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    if (!visible) return
    AlertDialog(
        onDismissRequest = onDismiss,
        icon = { Icon(Icons.Default.Warning, null, tint = ArtivaaColors.Error) },
        title = { Text("Delete meeting?") },
        text = { Text("This cannot be undone.") },
        confirmButton = {
            TextButton(onClick = onConfirm) {
                Text("Delete", color = ArtivaaColors.Error)
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
```

### ModalBottomSheet — workspace switcher

```kotlin
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WorkspaceSwitcherSheet(
    visible: Boolean,
    workspaces: List<Workspace>,
    onSelect: (String?) -> Unit,
    onDismiss: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState()
    if (visible) {
        ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
            Text("Personal", Modifier.clickable { onSelect(null); onDismiss() }.padding(16.dp))
            workspaces.forEach { ws ->
                Text(ws.name, Modifier.clickable { onSelect(ws.id); onDismiss() }.padding(16.dp))
            }
        }
    }
}
```

### Snackbar

```kotlin
val snackbarHostState = remember { SnackbarHostState() }
Scaffold(snackbarHost = { SnackbarHost(snackbarHostState) }) { padding ->
    // ...
    LaunchedEffect(errorMessage) {
        errorMessage?.let {
            snackbarHostState.showSnackbar(it)
        }
    }
}
```

---

## 7. Scaffold & tabs

### App shell — bottom nav

```kotlin
@Composable
fun ArtivaaApp() {
    val navController = rememberNavController()
    val items = listOf(
        NavItem("dashboard", "Home", Icons.Default.Home),
        NavItem("meetings", "Meetings", Icons.Default.Videocam),
        NavItem("reports", "Reports", Icons.Default.BarChart),
        NavItem("tasks", "Tasks", Icons.Default.Assignment),
        NavItem("more", "More", Icons.Default.Menu),
    )
    Scaffold(
        bottomBar = {
            NavigationBar(containerColor = Color.White) {
                val navBackStackEntry by navController.currentBackStackEntryAsState()
                val currentRoute = navBackStackEntry?.destination?.route
                items.forEach { item ->
                    NavigationBarItem(
                        selected = currentRoute == item.route,
                        onClick = { navController.navigate(item.route) {
                            popUpTo(navController.graph.startDestinationId) { saveState = true }
                            launchSingleTop = true
                            restoreState = true
                        }},
                        icon = { Icon(item.icon, item.label) },
                        label = { Text(item.label) },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = ArtivaaColors.Primary,
                            selectedTextColor = ArtivaaColors.Primary,
                            indicatorColor = ArtivaaColors.PrimaryLight
                        )
                    )
                }
            }
        }
    ) { innerPadding ->
        ArtivaaNavHost(navController, Modifier.padding(innerPadding))
    }
}
```

### TabRow — meeting detail

```kotlin
@Composable
fun MeetingDetailTabs(meeting: Meeting) {
    var tab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Overview", "Transcript", "Insights")
    Column {
        TabRow(selectedTabIndex = tab, containerColor = Color.White) {
            tabs.forEachIndexed { index, title ->
                Tab(
                    selected = tab == index,
                    onClick = { tab = index },
                    text = {
                        Text(
                            title,
                            color = if (tab == index) ArtivaaColors.Primary else ArtivaaColors.TextSecondary
                        )
                    }
                )
            }
        }
        when (tab) {
            0 -> OverviewTab(meeting)
            1 -> TranscriptTab(meeting)
            2 -> InsightsTab(meeting)
        }
    }
}
```

---

## 8. UiState pattern

Phase 1 (mock):

```kotlin
@Composable
fun ReportsScreen() {
    // Phase 1 — direct mock
    val reports = MockData.reports
    ReportsContent(reports)
}
```

Phase 2 (ViewModel):

```kotlin
@HiltViewModel
class ReportsViewModel @Inject constructor(
    private val repo: ReportsRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow<ReportsUiState>(ReportsUiState.Loading)
    val uiState: StateFlow<ReportsUiState> = _uiState.asStateFlow()

    init { load() }

    fun load() {
        viewModelScope.launch {
            _uiState.value = ReportsUiState.Loading
            repo.getReports()
                .onSuccess { _uiState.value = ReportsUiState.Success(it) }
                .onFailure { _uiState.value = ReportsUiState.Error(it.message ?: "Failed") }
        }
    }
}

@Composable
fun ReportsRoute(viewModel: ReportsViewModel = hiltViewModel()) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    when (val s = state) {
        is ReportsUiState.Loading -> LoadingSkeleton()
        is ReportsUiState.Success -> ReportsContent(s.reports)
        is ReportsUiState.Error -> ErrorState(s.message, onRetry = viewModel::load)
    }
}
```

---

## 9. Forms

### TextField — search

```kotlin
OutlinedTextField(
    value = query,
    onValueChange = onQueryChange,
    modifier = Modifier.fillMaxWidth(),
    placeholder = { Text("Search tasks...", color = ArtivaaColors.TextDisabled) },
    leadingIcon = { Icon(Icons.Default.Search, null) },
    shape = RoundedCornerShape(8.dp),
    colors = OutlinedTextFieldDefaults.colors(
        focusedBorderColor = ArtivaaColors.Primary,
        cursorColor = ArtivaaColors.Primary
    )
)
```

### Switch — settings toggle

```kotlin
Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
    Text("Email notifications")
    Switch(
        checked = enabled,
        onCheckedChange = onToggle,
        colors = SwitchDefaults.colors(checkedTrackColor = ArtivaaColors.Primary)
    )
}
```

---

## 10. Navigation

### Type-safe routes (Kotlin 2.0+ / sealed)

```kotlin
sealed class Route(val path: String) {
    data object Dashboard : Route("dashboard")
    data object Meetings : Route("meetings")
    data class MeetingDetail(val id: String) : Route("meetings/{id}") {
        companion object { const val pattern = "meetings/{id}" }
        fun create(id: String) = "meetings/$id"
    }
    data object ActionItems : Route("action-items")
    data object Reports : Route("reports")
    // ... design spec ki HAR screen yahan
}
```

### NavHost

```kotlin
@Composable
fun ArtivaaNavHost(navController: NavHostController, modifier: Modifier = Modifier) {
    NavHost(navController, startDestination = Route.Dashboard.path, modifier = modifier) {
        composable(Route.Dashboard.path) { DashboardScreen() }
        composable(Route.Meetings.path) { MeetingsListScreen(
            onMeetingClick = { id -> navController.navigate(Route.MeetingDetail.create(id)) }
        )}
        composable(Route.MeetingDetail.pattern) { backStackEntry ->
            val id = backStackEntry.arguments?.getString("id") ?: return@composable
            MeetingDetailScreen(id, onBack = { navController.popBackStack() })
        }
        // ... baaki screens
    }
}
```

**Rule:** Naya screen = pehle `Route` + `NavHost` entry — orphan mat chhodo.

---

## 11. Theming

```kotlin
object ArtivaaColors {
    val Primary = Color(0xFF6C3FF5)
    val PrimaryDark = Color(0xFF5B2FE0)
    val PrimaryLight = Color(0xFFEDE9FE)
    val Background = Color(0xFFF8F9FA)
    val Surface = Color(0xFFFFFFFF)
    val Border = Color(0xFFDADCE0)
    val Text = Color(0xFF202124)
    val TextSecondary = Color(0xFF5F6368)
    val Error = Color(0xFFEA4335)
    val WarningLight = Color(0xFFFEF7E0)
    val WarningText = Color(0xFFB06000)
}

@Composable
fun ArtivaaTheme(content: @Composable () -> Unit) {
    val colorScheme = lightColorScheme(
        primary = ArtivaaColors.Primary,
        onPrimary = Color.White,
        background = ArtivaaColors.Background,
        surface = ArtivaaColors.Surface,
        error = ArtivaaColors.Error
    )
    MaterialTheme(colorScheme = colorScheme, typography = ArtivaaTypography, content = content)
}
```

### Reusable button

```kotlin
@Composable
fun ArtivaaPrimaryButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    enabled: Boolean = true
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(48.dp),
        shape = RoundedCornerShape(8.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = ArtivaaColors.Primary,
            disabledContainerColor = ArtivaaColors.Primary.copy(alpha = 0.4f)
        )
    ) {
        Text(text, fontWeight = FontWeight.SemiBold)
    }
}
```

---

## 12. Side effects

### LaunchedEffect — one-shot / key-based

```kotlin
LaunchedEffect(meetingId) {
    // Phase 2: load meeting
    // Phase 1: skip — use MockData.getMeeting(meetingId)
}
```

### DisposableEffect — cleanup

```kotlin
DisposableEffect(Unit) {
    onDispose { /* cancel listener */ }
}
```

### rememberCoroutineScope — button click pe launch

```kotlin
val scope = rememberCoroutineScope()
Button(onClick = {
    scope.launch { snackbarHostState.showSnackbar("Saved") }
}) { Text("Save") }
```

---

## 13. ViewModel + StateFlow

```kotlin
class MeetingDetailViewModel(
    private val meetingId: String,
    private val api: MeetingsApi // Phase 2
) : ViewModel() {

    private val _meeting = MutableStateFlow<Meeting?>(null)
    val meeting: StateFlow<Meeting?> = _meeting.asStateFlow()

    init {
        // Phase 1
        _meeting.value = MockData.getMeeting(meetingId)
        // Phase 2: viewModelScope.launch { _meeting.value = api.getById(meetingId) }
    }
}
```

Collect in UI:

```kotlin
val meeting by viewModel.meeting.collectAsStateWithLifecycle()
```

Dependency: `androidx.lifecycle:lifecycle-runtime-compose`

---

## 14. Coroutines

### suspend function

```kotlin
suspend fun fetchMeetings(): List<Meeting> = withContext(Dispatchers.IO) {
    delay(500) // simulate network Phase 1
    MockData.todayMeetings
}
```

### viewModelScope.launch

```kotlin
viewModelScope.launch {
    try {
        val data = repo.getMeetings()
        _uiState.value = UiState.Success(data)
    } catch (e: Exception) {
        _uiState.value = UiState.Error(e.message ?: "Error")
    }
}
```

### Dispatchers

| Dispatcher | Use |
|------------|-----|
| `Main` | UI updates (default in launch) |
| `IO` | Network, disk |
| `Default` | CPU heavy (JSON parse large) |

### async / await — parallel calls

```kotlin
viewModelScope.launch {
    val meetings = async { repo.getToday() }
    val stats = async { repo.getStats() }
    _uiState.value = Success(meetings.await(), stats.await())
}
```

---

## 15. Flow

### Cold flow — bot status polling (Phase 2)

```kotlin
fun meetingStatusFlow(meetingId: String): Flow<MeetingStatus> = flow {
    while (currentCoroutineContext().isActive) {
        emit(api.getStatus(meetingId).status)
        delay(3_000)
    }
}.flowOn(Dispatchers.IO)
```

Collect:

```kotlin
LaunchedEffect(meetingId) {
    repo.statusFlow(meetingId).collect { status ->
        botStatus = status
    }
}
```

### stateIn — ViewModel mein hot StateFlow

```kotlin
val uiState: StateFlow<UiState> = repo.meetingsFlow
    .map { UiState.Success(it) }
    .catch { emit(UiState.Error(it.message ?: "Error")) }
    .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), UiState.Loading)
```

### Turbine test

```kotlin
@Test
fun `status flow emits updates`() = runTest {
    repo.statusFlow("id").test {
        assertEquals(MeetingStatus.CAPTURING, awaitItem())
        cancelAndIgnoreRemainingEvents()
    }
}
```

---

## 16. Retrofit (Phase 2)

```kotlin
interface MeetingsApi {
    @GET("api/meetings/today")
    suspend fun getToday(): MeetingsResponse

    @GET("api/meetings/{id}")
    suspend fun getById(@Path("id") id: String): MeetingDetailResponse

    @POST("api/meetings/{id}/bot/start")
    suspend fun startBot(@Path("id") id: String, @Body body: StartBotRequest): Response<Unit>
}

class ClerkAuthInterceptor(
    private val tokenProvider: () -> String?
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val token = tokenProvider() ?: return chain.proceed(chain.request())
        return chain.proceed(
            chain.request().newBuilder()
                .header("Authorization", "Bearer $token")
                .build()
        )
    }
}
```

---

## 17. Hilt (Phase 2)

```kotlin
@HiltAndroidApp
class ArtivaaApplication : Application()

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides @Singleton
    fun provideMeetingsApi(retrofit: Retrofit): MeetingsApi =
        retrofit.create(MeetingsApi::class.java)
}

@AndroidEntryPoint
class MainActivity : ComponentActivity()
```

ViewModel:

```kotlin
@HiltViewModel
class MeetingsViewModel @Inject constructor(
    private val api: MeetingsApi
) : ViewModel()
```

---

## 18. Testing

### Compose UI test

```kotlin
@Test
fun reportsScreen_showsLockedBanner_forFreePlan() {
    MockData.currentPlan = Plan.FREE
    composeTestRule.setContent { ArtivaaTheme { ReportsScreen() } }
    composeTestRule.onNodeWithText("requires Pro or Elite").assertIsDisplayed()
}
```

### Preview — development speed

```kotlin
@Preview(showBackground = true)
@Composable
private fun MeetingCardPreview() {
    ArtivaaTheme {
        MeetingCard(meeting = MockData.sampleMeeting)
    }
}
```

---

## 19. Artivaa-specific patterns

### Plan-gated UI (Phase 1 mock)

```kotlin
@Composable
fun ActionItemsScreen() {
    when (MockData.currentPlan) {
        Plan.FREE -> LockedProBanner(feature = "Task Backlog")
        Plan.PRO -> {
            ProReadOnlyBanner()
            ActionItemsContent(readOnly = true, onEliteAction = { showEliteDialog = true })
        }
        Plan.ELITE, Plan.TRIAL -> ActionItemsContent(readOnly = false)
    }
}
```

### Elite dialog

```kotlin
@Composable
fun EliteRequiredDialog(visible: Boolean, onDismiss: () -> Unit, onUpgrade: () -> Unit) {
    if (!visible) return
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Available on Elite") },
        text = { Text("Upgrade to export, share, and edit tasks.") },
        confirmButton = {
            TextButton(onClick = onUpgrade) { Text("Upgrade to Elite") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Maybe later") }
        }
    )
}
```

### Segmented filter (Meetings)

```kotlin
@Composable
fun SegmentedControl(options: List<String>, selected: String, onSelect: (String) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(8.dp))
            .background(ArtivaaColors.SurfaceVariant)
            .padding(4.dp)
    ) {
        options.forEach { option ->
            val isSelected = option == selected
            Box(
                Modifier
                    .weight(1f)
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (isSelected) Color.White else Color.Transparent)
                    .clickable { onSelect(option) }
                    .padding(vertical = 8.dp),
                contentAlignment = Alignment.Center
            ) {
                Text(
                    option,
                    color = if (isSelected) ArtivaaColors.Primary else ArtivaaColors.TextSecondary,
                    fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal
                )
            }
        }
    }
}
```

### Action items table row (LazyColumn)

```kotlin
@Composable
fun ActionItemRow(item: ActionItem, readOnly: Boolean, onStatusChange: (String) -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(item.key, color = ArtivaaColors.Primary, fontFamily = FontFamily.Monospace)
        Column(Modifier.weight(1f).padding(horizontal = 8.dp)) {
            Text(item.task, fontWeight = FontWeight.Medium)
            Text(item.meetingTitle ?: "Direct Entry", fontSize = 11.sp, color = ArtivaaColors.TextSecondary)
        }
        if (readOnly) {
            StatusBadge(item.status)
        } else {
            StatusDropdown(item.status, onStatusChange)
        }
    }
    HorizontalDivider(color = ArtivaaColors.Border.copy(alpha = 0.5f))
}
```

---

## 20. Common mistakes

| Mistake | Fix |
|---------|-----|
| API call inside `@Composable` body | ViewModel + StateFlow ya LaunchedEffect |
| `remember { mutableStateOf(list) }` + `.add()` | New list assign: `items = items + newItem` |
| Modifier order wrong | `.padding` after `.background` jab padding colored chahiye |
| LazyColumn mein `Column` of items | Sirf `items { }` — warna lazy nahi |
| NavController har screen pe naya | Ek NavHost top level |
| Phase 1 mein Retrofit | MockData use karo — plan follow karo |
| Random screen without Route | Pehle Routes.kt update karo |

---

## Sprint → chapter map

| Sprint | Read chapters |
|--------|----------------|
| 1–2 ✅ | 1–5, 7, 11 |
| 3 Reports + Tasks | 4, 6, 8, 19 |
| 4 History + Tools | 4, 7, 9 |
| 5 Settings + Billing | 7, 9, 11 |
| 6 Workspace + Auth | 6, 10 |
| 7 QA | 18 |
| 8+ API | 12–17 |

---

## External resources

- [Compose pathway](https://developer.android.com/jetpack/compose/tutorial) — official tutorial
- [Kotlin coroutines guide](https://kotlinlang.org/docs/coroutines-guide.html)
- Philipp Lackner — Compose + MVVM YouTube playlists
- [Now in Android](https://github.com/android/nowinandroid) — Google sample architecture (Phase 2 reference)

---

*AI agents: is file ko update karte raho jab naya Compose pattern Artivaa mein introduce ho — example ke saath, taaki Pulkit ki learning consistent rahe.*
