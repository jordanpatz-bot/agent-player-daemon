using System;
using System.IO;
using System.Collections.Generic;
using System.Linq;
using System.Reflection;
using System.Text;
using XRL;
using XRL.Core;
using XRL.World;
using XRL.World.Parts;
using XRL.UI;
using Newtonsoft.Json;
using UE = UnityEngine;

/// <summary>
/// Mutator that attaches AgentBridgePart to the player at game start
/// and creates the background command poller.
/// </summary>
[PlayerMutator]
public class AgentBridgeMutator : IPlayerMutator
{
    public void mutate(XRL.World.GameObject player)
    {
        player.RequirePart<AgentBridgePart>();

        // Enable background running so Unity doesn't pause when unfocused
        UE.Application.runInBackground = true;

        // Create a persistent MonoBehaviour to poll for commands every frame
        if (AgentPoller.Instance == null)
        {
            var go = new UE.GameObject("AgentBridgePoller");
            UE.Object.DontDestroyOnLoad(go);
            go.AddComponent<AgentPoller>();
        }
    }
}

/// <summary>
/// MonoBehaviour that runs Update() every frame — even when the game is waiting
/// for player input and even when Qud is not focused (runInBackground=true).
/// Polls for command.txt and synthesizes input to advance turns.
/// </summary>
public class AgentPoller : UE.MonoBehaviour
{
    public static AgentPoller Instance;
    float pollTimer = 0f;
    float pollInterval = 0.5f;

    string CommandPath;
    string RequestPath;
    bool initialized = false;

    void Awake()
    {
        Instance = this;
    }

    void Update()
    {
        if (!initialized)
        {
            string home = System.Environment.GetFolderPath(System.Environment.SpecialFolder.UserProfile);
            string ipcDir = System.IO.Path.Combine(home, "mud-daemon-gamestate", "mud-daemon", "data", "qud", "ipc");
            CommandPath = System.IO.Path.Combine(ipcDir, "command.txt");
            RequestPath = System.IO.Path.Combine(ipcDir, "request.json");
            initialized = true;
        }

        pollTimer += UE.Time.unscaledDeltaTime;
        if (pollTimer < pollInterval) return;
        pollTimer = 0f;

        // ── Popup suppression ──────────────────────────────────────────────
        // Popups ("Your health has fallen below 40%", discoveries, etc.) block
        // game input until Space is pressed.  While blocked, hostiles still
        // attack → agent dies.  We use multiple reflection strategies so this
        // compiles regardless of which (if any) APIs exist in the running build.
        //
        // Strategy A: Set static suppress flags on XRL.UI.Popup
        // Strategy B: Push Space + Enter into the keyboard buffer
        // Strategy C: Set GameManager-level skip flags
        // Strategy D: Set Options-based suppress flag via game state
        // ─────────────────────────────────────────────────────────────────────
        {
            string home2 = System.Environment.GetFolderPath(System.Environment.SpecialFolder.UserProfile);
            string debugPath = System.IO.Path.Combine(home2, "mud-daemon-gamestate", "mud-daemon", "data", "qud", "ipc", "debug.log");

            var asm = typeof(XRL.Core.XRLCore).Assembly;
            var bindAll = System.Reflection.BindingFlags.Public
                        | System.Reflection.BindingFlags.NonPublic
                        | System.Reflection.BindingFlags.Static;

            // ── Strategy A: suppress popup booleans on XRL.UI.Popup ──────────
            try
            {
                var popupType = typeof(XRL.UI.Popup);
                string[] candidateFields = new string[]
                {
                    "SuppressPopups", "Suppressed", "bSuppressed", "_suppress",
                    "Suppress", "SuppressAll", "SuppressModalPopups",
                    "_suppressPopups", "suppressPopups"
                };
                foreach (var fname in candidateFields)
                {
                    try
                    {
                        var field = popupType.GetField(fname, bindAll);
                        if (field != null && field.FieldType == typeof(bool))
                        {
                            field.SetValue(null, true);
                            try { System.IO.File.AppendAllText(debugPath,
                                $"[{System.DateTime.Now}] PopupSuppress: set Popup.{fname}=true\n"); } catch {}
                        }
                    }
                    catch {}
                }
                // Also try static properties with a setter
                string[] candidateProps = new string[]
                {
                    "SuppressPopups", "Suppressed", "Suppress", "SuppressAll"
                };
                foreach (var pname in candidateProps)
                {
                    try
                    {
                        var prop = popupType.GetProperty(pname, bindAll);
                        if (prop != null && prop.PropertyType == typeof(bool) && prop.CanWrite)
                        {
                            prop.SetValue(null, true);
                            try { System.IO.File.AppendAllText(debugPath,
                                $"[{System.DateTime.Now}] PopupSuppress: set Popup.{pname} (prop)=true\n"); } catch {}
                        }
                    }
                    catch {}
                }
            }
            catch {}

            // ── Strategy B: push Space + Enter into keyboard buffer ──────────
            try
            {
                var kbType = asm.GetType("ConsoleLib.Console.Keyboard");
                if (kbType != null)
                {
                    // Try PushKey(char)
                    var pushChar = kbType.GetMethod("PushKey", bindAll,
                        null, new System.Type[] { typeof(char) }, null);
                    // Try PushKey(UnityEngine.KeyCode)
                    var pushKC = kbType.GetMethod("PushKey", bindAll,
                        null, new System.Type[] { typeof(UE.KeyCode) }, null);
                    // Try PushKey(string)
                    var pushStr = kbType.GetMethod("PushKey", bindAll,
                        null, new System.Type[] { typeof(string) }, null);

                    // Push Space
                    if (pushChar != null)
                    {
                        pushChar.Invoke(null, new object[] { ' ' });
                        pushChar.Invoke(null, new object[] { '\n' });
                    }
                    if (pushKC != null)
                    {
                        pushKC.Invoke(null, new object[] { UE.KeyCode.Space });
                        pushKC.Invoke(null, new object[] { UE.KeyCode.Return });
                        pushKC.Invoke(null, new object[] { UE.KeyCode.Escape });
                    }
                    if (pushStr != null)
                    {
                        pushStr.Invoke(null, new object[] { " " });
                    }

                    // Also try vkPush / PushInput / BufferKey / etc.
                    string[] altMethods = new string[] { "vkPush", "PushInput", "BufferKey", "InjectKey" };
                    foreach (var mName in altMethods)
                    {
                        try
                        {
                            var m = kbType.GetMethod(mName, bindAll);
                            if (m != null)
                            {
                                var p = m.GetParameters();
                                if (p.Length == 1 && p[0].ParameterType == typeof(char))
                                    m.Invoke(null, new object[] { ' ' });
                                else if (p.Length == 1 && p[0].ParameterType == typeof(UE.KeyCode))
                                    m.Invoke(null, new object[] { UE.KeyCode.Space });
                            }
                        }
                        catch {}
                    }

                    try { System.IO.File.AppendAllText(debugPath,
                        $"[{System.DateTime.Now}] PopupSuppress: pushed keys via Keyboard (pushChar={pushChar != null}, pushKC={pushKC != null}, pushStr={pushStr != null})\n"); } catch {}
                }
            }
            catch {}

            // ── Strategy C: GameManager / XRLCore skip flags ─────────────────
            try
            {
                // Try GameManager.Instance.SkipPopup and similar
                string[] gmTypeNames = new string[]
                {
                    "XRL.Core.GameManager", "XRL.GameManager", "GameManager"
                };
                foreach (var gmName in gmTypeNames)
                {
                    try
                    {
                        var gmType = asm.GetType(gmName);
                        if (gmType == null) continue;
                        // Get the singleton instance
                        var instField = gmType.GetField("Instance", bindAll)
                                     ?? gmType.GetField("instance", bindAll);
                        var instProp = gmType.GetProperty("Instance", bindAll);
                        object inst = instField?.GetValue(null) ?? instProp?.GetValue(null);
                        if (inst == null) continue;

                        string[] skipFields = new string[]
                        {
                            "SkipPopup", "SkipPopups", "bSkipPopups",
                            "SuppressPopup", "SuppressPopups", "DismissPopup"
                        };
                        foreach (var sf in skipFields)
                        {
                            try
                            {
                                var f = inst.GetType().GetField(sf, bindAll | System.Reflection.BindingFlags.Instance);
                                if (f != null && f.FieldType == typeof(bool))
                                {
                                    f.SetValue(inst, true);
                                    try { System.IO.File.AppendAllText(debugPath,
                                        $"[{System.DateTime.Now}] PopupSuppress: set {gmName}.{sf}=true\n"); } catch {}
                                }
                            }
                            catch {}
                        }
                    }
                    catch {}
                }
            }
            catch {}

            // ── Strategy D: Options / game state boolean ─────────────────────
            try
            {
                var game = XRL.Core.XRLCore.Core?.Game;
                if (game != null)
                {
                    // Try SetBooleanGameState for any option that suppresses popups
                    string[] optionNames = new string[]
                    {
                        "OptionSuppressPopups",
                        "OptionDisablePopups",
                        "OptionNoPopups",
                        "SuppressPopups"
                    };
                    var setMethod = game.GetType().GetMethod("SetBooleanGameState",
                        System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.Instance,
                        null, new System.Type[] { typeof(string), typeof(bool) }, null);
                    if (setMethod != null)
                    {
                        foreach (var opt in optionNames)
                        {
                            try
                            {
                                setMethod.Invoke(game, new object[] { opt, true });
                            }
                            catch {}
                        }
                        try { System.IO.File.AppendAllText(debugPath,
                            $"[{System.DateTime.Now}] PopupSuppress: set game state options via SetBooleanGameState\n"); } catch {}
                    }
                    else
                    {
                        // Try direct property/field on Game object
                        foreach (var opt in optionNames)
                        {
                            try
                            {
                                var f = game.GetType().GetField(opt, bindAll | System.Reflection.BindingFlags.Instance);
                                if (f != null && f.FieldType == typeof(bool))
                                    f.SetValue(game, true);
                            }
                            catch {}
                        }
                    }

                    // Also try the Options class directly
                    try
                    {
                        var optionsType = asm.GetType("XRL.UI.Options") ?? asm.GetType("XRL.Options");
                        if (optionsType != null)
                        {
                            string[] optFields = new string[]
                            {
                                "SuppressPopups", "DisablePopups", "bSuppressPopups"
                            };
                            foreach (var of in optFields)
                            {
                                try
                                {
                                    var f = optionsType.GetField(of, bindAll);
                                    if (f != null && f.FieldType == typeof(bool))
                                    {
                                        f.SetValue(null, true);
                                        try { System.IO.File.AppendAllText(debugPath,
                                            $"[{System.DateTime.Now}] PopupSuppress: set Options.{of}=true\n"); } catch {}
                                    }
                                }
                                catch {}
                            }
                        }
                    }
                    catch {}
                }
            }
            catch {}
        }

        // ── Typed harness protocol: request.json (preferred) ──────────────
        // Check for request.json FIRST. If present, process via typed protocol
        // and write response.json. Falls back to legacy command.txt below.
        if (System.IO.File.Exists(RequestPath))
        {
            try
            {
                var player = XRLCore.Core?.Game?.Player?.Body;
                if (player != null)
                {
                    string requestJson = System.IO.File.ReadAllText(RequestPath).Trim();
                    System.IO.File.Delete(RequestPath);
                    if (!string.IsNullOrEmpty(requestJson))
                    {
                        AgentBridgePart.ProcessRequest(player, requestJson);
                        AgentBridgePart.WriteStateStatic(player);
                    }
                }
            }
            catch { }
        }
        // ── Legacy protocol: command.txt ──────────────────────────────────
        // If no request.json, process command.txt via existing flow.
        else if (System.IO.File.Exists(CommandPath))
        {
            try
            {
                var player = XRLCore.Core?.Game?.Player?.Body;
                if (player != null)
                {
                    string command = System.IO.File.ReadAllText(CommandPath).Trim();
                    System.IO.File.Delete(CommandPath);
                    if (!string.IsNullOrEmpty(command))
                    {
                        var result = AgentBridgePart.ExecuteCommand(player, command);
                        string home = System.Environment.GetFolderPath(System.Environment.SpecialFolder.UserProfile);
                        string resultPath = System.IO.Path.Combine(home, "mud-daemon-gamestate", "mud-daemon", "data", "qud", "ipc", "result.json");
                        System.IO.File.WriteAllText(resultPath, JsonConvert.SerializeObject(result, Formatting.Indented));
                        AgentBridgePart.WriteStateStatic(player);
                    }
                }
            }
            catch { }
        }
    }
}


/// <summary>
/// AgentBridgePart — Exposes Caves of Qud game state via file-based IPC.
/// Writes state.json + screen.txt each turn, reads command.txt for agent input.
/// </summary>
public class AgentBridgePart : IPart
{
    static string IpcDir;
    static string StatePath;
    static string CommandPath;
    static string ResultPath;
    static string ScreenPath;
    static string RequestPath;   // request.json (typed harness protocol)
    static string ResponsePath;  // response.json (typed harness protocol)
    static bool DirCreated = false;

    // Monotonic state version counter — increments every time state is written.
    // Resets on game restart (session-scoped).
    static long _stateVersion = 0;

    // Conversation state (XML-based)
    static System.Xml.XmlNode _currentConvXml;
    static string _currentNodeId;
    static string _lastSpeakerName;

    // Event stream
    static List<Dictionary<string, object>> _pendingEvents = new List<Dictionary<string, object>>();
    static int _lastHp = -1;

    static void EmitEvent(string type, Dictionary<string, object> data = null)
    {
        var evt = new Dictionary<string, object>
        {
            ["type"] = type,
            ["turn"] = XRLCore.CurrentTurn,
            ["time"] = DateTime.Now.ToString("o")
        };
        if (data != null)
            foreach (var kv in data)
                evt[kv.Key] = kv.Value;
        _pendingEvents.Add(evt);
    }

    static void EnsureDir()
    {
        if (DirCreated) return;
        string home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        IpcDir = Path.Combine(home, "mud-daemon-gamestate", "mud-daemon", "data", "qud", "ipc");
        StatePath = Path.Combine(IpcDir, "state.json");
        CommandPath = Path.Combine(IpcDir, "command.txt");
        ResultPath = Path.Combine(IpcDir, "result.json");
        ScreenPath = Path.Combine(IpcDir, "screen.txt");
        RequestPath = Path.Combine(IpcDir, "request.json");
        ResponsePath = Path.Combine(IpcDir, "response.json");
        try { Directory.CreateDirectory(IpcDir); } catch { }
        DirCreated = true;
    }

    // Use TurnTick — deprecated but fires reliably every turn
    public override bool WantTurnTick() => true;

    public override void TurnTick(long TurnNumber)
    {
        EnsureDir();
        // Heartbeat — proves TurnTick fires
        File.WriteAllText(Path.Combine(IpcDir, "tick.txt"), $"{DateTime.Now} turn={TurnNumber} cmdExists={File.Exists(CommandPath)} path={CommandPath}");
        try
        {
            ProcessCommands(ParentObject);
        }
        catch (Exception ex)
        {
            File.WriteAllText(Path.Combine(IpcDir, "cmd-error.txt"), $"{DateTime.Now} {ex}");
        }
        try
        {
            WriteStateStatic(ParentObject);
            WriteScreenBuffer();
        }
        catch (Exception ex)
        {
            LogError("TurnTick", ex);
        }
    }

    /// <summary>
    /// Write game state — called from both the part and the Harmony patch.
    /// </summary>
    public static void WriteStateStatic(GameObject player)
    {
        EnsureDir();
        if (player == null) return;

        _stateVersion++;

        var state = new Dictionary<string, object>();
        state["stateVersion"] = _stateVersion;

        // Player Stats
        var stats = new Dictionary<string, object>();
        if (player.Statistics != null)
        {
            foreach (var stat in player.Statistics)
            {
                stats[stat.Key] = new Dictionary<string, int>
                {
                    ["value"] = stat.Value.Value,
                    ["base"] = stat.Value.BaseValue,
                    ["max"] = stat.Value.Max
                };
            }
        }
        state["stats"] = stats;
        state["turn"] = XRLCore.CurrentTurn;
        state["name"] = ConsoleLib.Console.ColorUtility.StripFormatting(player.DisplayName ?? "Unknown");
        state["level"] = player.Statistics?.ContainsKey("Level") == true ? player.Statistics["Level"].Value : 0;
        state["hp"] = player.Statistics?.ContainsKey("Hitpoints") == true ? player.Statistics["Hitpoints"].Value : 0;
        state["maxHp"] = player.Statistics?.ContainsKey("Hitpoints") == true ? player.Statistics["Hitpoints"].BaseValue : 0;
        state["xp"] = player.Statistics?.ContainsKey("XP") == true ? player.Statistics["XP"].Value : 0;
        state["av"] = player.Statistics?.ContainsKey("AV") == true ? player.Statistics["AV"].Value : 0;
        state["dv"] = player.Statistics?.ContainsKey("DV") == true ? player.Statistics["DV"].Value : 0;

        // Position
        var cell = player.CurrentCell;
        if (cell != null)
        {
            state["position"] = new Dictionary<string, int> { ["x"] = cell.X, ["y"] = cell.Y };
            state["zone"] = cell.ParentZone?.ZoneID ?? "unknown";
            state["zoneName"] = cell.ParentZone?.DisplayName ?? "unknown";

            // Exits
            var exits = new Dictionary<string, bool>();
            foreach (string dir in new[] { "N", "NE", "E", "SE", "S", "SW", "W", "NW" })
            {
                var adj = cell.GetCellFromDirection(dir);
                exits[dir] = adj != null && !adj.IsSolid();
            }
            state["exits"] = exits;

            // Visible entities
            var entities = new List<Dictionary<string, object>>();
            if (cell.ParentZone != null)
            {
                foreach (var obj in cell.ParentZone.GetObjects())
                {
                    if (obj == player) continue;
                    if (obj.Brain == null && !obj.HasPart("Combat")) continue;
                    var e = new Dictionary<string, object>
                    {
                        ["id"] = obj.id ?? obj.GetHashCode().ToString(),
                        ["name"] = ConsoleLib.Console.ColorUtility.StripFormatting(obj.DisplayName ?? "?"),
                        ["x"] = obj.CurrentCell?.X ?? -1,
                        ["y"] = obj.CurrentCell?.Y ?? -1,
                        ["hostile"] = obj.Brain?.IsHostileTowards(player) ?? false,
                    };
                    if (obj.Statistics?.ContainsKey("Hitpoints") == true)
                    {
                        e["hp"] = obj.Statistics["Hitpoints"].Value;
                        e["maxHp"] = obj.Statistics["Hitpoints"].BaseValue;
                    }
                    entities.Add(e);
                }
            }
            state["entities"] = entities;
        }

        // Adjacent entities — who's right next to you and in which direction
        var adjacent = new List<Dictionary<string, object>>();
        if (cell != null)
        {
            string[] adjDirs = { "N", "NE", "E", "SE", "S", "SW", "W", "NW" };
            foreach (string dir in adjDirs)
            {
                var adjCell = cell.GetCellFromDirection(dir);
                if (adjCell == null) continue;
                foreach (var obj in adjCell.GetObjectsInCell())
                {
                    if (obj.Brain != null)
                    {
                        adjacent.Add(new Dictionary<string, object>
                        {
                            ["id"] = obj.id ?? obj.GetHashCode().ToString(),
                            ["name"] = ConsoleLib.Console.ColorUtility.StripFormatting(obj.DisplayName ?? "?"),
                            ["direction"] = dir,
                            ["hostile"] = obj.Brain.IsHostileTowards(player),
                            ["hasTrade"] = obj.HasPart("GenericInventoryRestocker") || obj.HasPart("Restocker"),
                            ["hasConversation"] = obj.HasPart("ConversationScript"),
                        });
                    }
                }
            }
        }
        state["adjacent"] = adjacent;

        // Inventory
        var inv = new List<Dictionary<string, string>>();
        if (player.Inventory?.Objects != null)
        {
            foreach (var item in player.Inventory.Objects)
                inv.Add(new Dictionary<string, string>
                {
                    ["id"] = item.id ?? item.GetHashCode().ToString(),
                    ["name"] = ConsoleLib.Console.ColorUtility.StripFormatting(item.DisplayName ?? "?")
                });
        }
        state["inventory"] = inv;

        // Equipment — what's equipped on each body slot
        var equipment = new Dictionary<string, string>();
        var body = player.Body;
        if (body != null)
        {
            foreach (var part in body.GetParts())
            {
                if (part.Equipped != null)
                    equipment[part.Type + (part.Laterality != 0 ? " (" + part.Laterality + ")" : "")] =
                        ConsoleLib.Console.ColorUtility.StripFormatting(part.Equipped.DisplayName ?? "?");
            }
        }
        state["equipment"] = equipment;

        // Mutations — use safe reflection to avoid API mismatch
        var mutations = new List<string>();
        try
        {
            var mutPart = player.GetPart("Mutations");
            if (mutPart != null)
            {
                var mutList = mutPart.GetType().GetProperty("MutationList")?.GetValue(mutPart) as System.Collections.IEnumerable;
                if (mutList != null)
                {
                    foreach (var mut in mutList)
                    {
                        var dn = mut.GetType().GetProperty("DisplayName")?.GetValue(mut) as string;
                        mutations.Add(dn ?? mut.ToString());
                    }
                }
            }
        }
        catch { }
        state["mutations"] = mutations;

        // Skills — use safe reflection
        var skills = new List<string>();
        try
        {
            var skillsPart = player.GetPart("Skills");
            if (skillsPart != null)
            {
                var skillList = skillsPart.GetType().GetProperty("SkillList")?.GetValue(skillsPart) as System.Collections.IDictionary;
                if (skillList != null)
                {
                    foreach (var key in skillList.Keys)
                        skills.Add(key.ToString());
                }
            }
        }
        catch { }
        state["skills"] = skills;

        // Active effects
        var effects = new List<string>();
        try
        {
            if (player.Effects != null)
                foreach (var effect in player.Effects)
                    effects.Add(effect.DisplayName ?? effect.GetType().Name);
        }
        catch { }
        state["effects"] = effects;

        // Active quests — read from The.Game quest system
        var quests = new List<Dictionary<string, object>>();
        var _questDebug = new List<string>();
        try
        {
            var game = The.Game;
            if (game != null)
            {
                _questDebug.Add("game_type:" + game.GetType().FullName);

                // Enumerate all quest-related members on the game object
                foreach (var prop in game.GetType().GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.NonPublic))
                {
                    string n = prop.Name.ToLowerInvariant();
                    if (n.Contains("quest")) _questDebug.Add("prop:" + prop.Name + "(" + prop.PropertyType.Name + ")");
                }
                foreach (var field in game.GetType().GetFields(BindingFlags.Public | BindingFlags.Instance | BindingFlags.NonPublic))
                {
                    string n = field.Name.ToLowerInvariant();
                    if (n.Contains("quest")) _questDebug.Add("field:" + field.Name + "(" + field.FieldType.Name + ")");
                }
                foreach (var meth in game.GetType().GetMethods(BindingFlags.Public | BindingFlags.Instance))
                {
                    string n = meth.Name.ToLowerInvariant();
                    if (n.Contains("quest"))
                    {
                        var parms = meth.GetParameters();
                        string sig = string.Join(",", parms.Select(p => p.ParameterType.Name));
                        _questDebug.Add("method:" + meth.Name + "(" + sig + ")=>" + meth.ReturnType.Name);
                    }
                }

                // Try multiple access patterns for the quest dictionary
                object questsDict = null;

                // Pattern 1: Public property
                questsDict = game.GetType().GetProperty("Quests", BindingFlags.Public | BindingFlags.Instance)?.GetValue(game);

                // Pattern 2: Public field
                if (questsDict == null)
                    questsDict = game.GetType().GetField("Quests", BindingFlags.Public | BindingFlags.Instance)?.GetValue(game);

                // Pattern 3: Non-public
                if (questsDict == null)
                    questsDict = game.GetType().GetProperty("Quests", BindingFlags.NonPublic | BindingFlags.Instance)?.GetValue(game);
                if (questsDict == null)
                    questsDict = game.GetType().GetField("Quests", BindingFlags.NonPublic | BindingFlags.Instance)?.GetValue(game);

                // Pattern 4: Try HasQuest to verify quests exist even if we can't enumerate
                if (questsDict == null)
                {
                    // List known quest IDs and check each
                    string[] knownQuests = { "What's Eating the Watervine?", "Fetch Argyve a Knickknack", "A Canticle for Barathrum" };
                    foreach (string qid in knownQuests)
                    {
                        if (CheckQuestCondition("HasQuest", qid))
                        {
                            var qEntry = new Dictionary<string, object>
                            {
                                ["id"] = qid,
                                ["name"] = qid,
                                ["finished"] = CheckQuestCondition("HasFinishedQuest", qid),
                                ["active"] = !CheckQuestCondition("HasFinishedQuest", qid)
                            };
                            quests.Add(qEntry);
                        }
                    }
                }
                // StringMap<Quest> — try IDictionary first, then IEnumerable<KeyValuePair>, then Keys enumeration
                if (questsDict != null)
                {
                    _questDebug.Add("questsDict_type:" + questsDict.GetType().FullName);

                    // Try to get Keys from the StringMap and iterate
                    System.Collections.IEnumerable keys = null;
                    try
                    {
                        keys = questsDict.GetType().GetProperty("Keys")?.GetValue(questsDict) as System.Collections.IEnumerable;
                        if (keys != null)
                        {
                            int kc = 0; foreach (var k in keys) kc++;
                            _questDebug.Add("keys_count:" + kc);
                        }
                        else _questDebug.Add("keys:null");
                    }
                    catch (Exception ex) { _questDebug.Add("keys_error:" + ex.Message); }

                    // Also try Count property
                    try
                    {
                        var countProp = questsDict.GetType().GetProperty("Count");
                        if (countProp != null) _questDebug.Add("count:" + countProp.GetValue(questsDict));
                    }
                    catch { }

                    // Iterate StringMap directly as IEnumerable<KeyValuePair<string, Quest>>
                    // Extract both key and value from each entry
                    var questEntries = new List<(string id, object quest)>();
                    try
                    {
                        if (questsDict is System.Collections.IEnumerable enumerable)
                        {
                            foreach (var kvp in enumerable)
                            {
                                var kProp = kvp.GetType().GetProperty("Key");
                                var vProp = kvp.GetType().GetProperty("Value");
                                string k = kProp?.GetValue(kvp)?.ToString();
                                object v = vProp?.GetValue(kvp);
                                if (k != null && v != null) questEntries.Add((k, v));
                            }
                            _questDebug.Add("entries_from_enum:" + questEntries.Count);
                        }
                    }
                    catch (Exception ex) { _questDebug.Add("enum_error:" + ex.Message); }

                    // Fallback: probe known quests via HasQuest
                    if (questEntries.Count == 0)
                    {
                        string[] known = { "What's Eating the Watervine?", "Fetch Argyve a Knickknack",
                            "Fetch Argyve Another Knickknack", "A Canticle for Barathrum" };
                        foreach (string qid in known)
                        {
                            if (CheckQuestCondition("HasQuest", qid))
                            {
                                // Use TryGetQuest to get the quest object
                                object questObj = null;
                                try
                                {
                                    var tgq = game.GetType().GetMethod("TryGetQuest");
                                    if (tgq != null)
                                    {
                                        var args = new object[] { qid, null };
                                        bool found = (bool)tgq.Invoke(game, args);
                                        if (found) questObj = args[1];
                                    }
                                }
                                catch { }
                                questEntries.Add((qid, questObj));
                            }
                        }
                        if (questEntries.Count > 0) _questDebug.Add("entries_from_probe:" + questEntries.Count);
                    }

                    foreach (var entry in questEntries)
                    {
                        string qId = entry.id;
                        object quest = entry.quest;

                            string qName = quest?.GetType().GetProperty("Name")?.GetValue(quest)?.ToString()
                                        ?? quest?.GetType().GetProperty("DisplayName")?.GetValue(quest)?.ToString()
                                        ?? qId;
                            bool finished = false;
                            try { finished = (bool)(quest.GetType().GetProperty("Finished")?.GetValue(quest) ?? false); } catch { }

                            var qEntry = new Dictionary<string, object>
                            {
                                ["id"] = qId,
                                ["name"] = qName,
                                ["finished"] = finished
                            };

                            // Try to read quest steps
                            var steps = new List<Dictionary<string, object>>();
                            try
                            {
                                var stepsObj = quest.GetType().GetProperty("Steps")?.GetValue(quest)
                                            ?? quest.GetType().GetField("Steps")?.GetValue(quest);
                                System.Collections.IEnumerable stepKeys = null;
                                try { stepKeys = stepsObj?.GetType().GetProperty("Keys")?.GetValue(stepsObj) as System.Collections.IEnumerable; } catch { }
                                if (stepKeys != null)
                                {
                                    var stepIndexer = stepsObj.GetType().GetProperty("Item");
                                    foreach (var sk in stepKeys)
                                    {
                                        object step = null;
                                        try { step = stepIndexer?.GetValue(stepsObj, new object[] { sk.ToString() }); } catch { }
                                        string sName = step?.GetType().GetProperty("Name")?.GetValue(step)?.ToString() ?? sk?.ToString() ?? "?";
                                        bool sDone = false;
                                        try { sDone = (bool)(step?.GetType().GetProperty("Finished")?.GetValue(step) ?? false); } catch { }
                                        steps.Add(new Dictionary<string, object> { ["name"] = sName, ["finished"] = sDone });
                                    }
                                }
                            }
                            catch { }
                            if (steps.Count > 0) qEntry["steps"] = steps;

                            quests.Add(qEntry);
                        }
                    }
                }
            }
        catch { }
        state["quests"] = quests;
        // Uncomment for quest system debugging:
        // if (_questDebug.Count > 0) state["_questDebug"] = _questDebug;

        // Known world locations from journal
        var knownLocations = new List<Dictionary<string, string>>();
        try {
            var journalType = typeof(XRL.Core.XRLCore).Assembly.GetType("Qud.API.JournalAPI");
            var mapNotesField = journalType?.GetField("MapNotes", BindingFlags.Public | BindingFlags.Static);
            var mapNotes = mapNotesField?.GetValue(null) as System.Collections.IList;
            if (mapNotes != null) {
                foreach (var note in mapNotes) {
                    string text = note.GetType().GetProperty("Text")?.GetValue(note)?.ToString() ?? "";
                    string zoneId = note.GetType().GetProperty("ZoneID")?.GetValue(note)?.ToString() ?? "";
                    bool revealed = (bool)(note.GetType().GetProperty("Revealed")?.GetValue(note) ?? false);
                    if (revealed && !string.IsNullOrEmpty(zoneId)) {
                        knownLocations.Add(new Dictionary<string, string> { ["name"] = text, ["zoneId"] = zoneId });
                    }
                }
            }
        } catch { }
        state["knownLocations"] = knownLocations;

        // Recent messages — read from GamePlayer.Messages (the MessageQueue instance)
        // Path: XRLCore.Core.Game.Player.Messages → MessageQueue.Messages (List<string>)
        var messages = new List<string>();
        try
        {
            var pgs = XRL.Core.XRLCore.Core?.Game?.Player;
            if (pgs != null)
            {
                var mqField = pgs.GetType().GetField("Messages", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                var mqInst = mqField?.GetValue(pgs);
                if (mqInst != null)
                {
                    var msgsField = typeof(XRL.Messages.MessageQueue).GetField("Messages", BindingFlags.Instance | BindingFlags.Public | BindingFlags.NonPublic);
                    if (msgsField?.GetValue(mqInst) is System.Collections.IList list && list.Count > 0)
                    {
                        int start = Math.Max(0, list.Count - 20);
                        for (int i = start; i < list.Count; i++)
                        {
                            string t = list[i]?.ToString();
                            if (!string.IsNullOrEmpty(t))
                                messages.Add(ConsoleLib.Console.ColorUtility.StripFormatting(t));
                        }
                    }
                }
            }
        }
        catch { }
        state["messages"] = messages;

        // Interaction state (Change 1c)
        var interaction = new Dictionary<string, object>();
        interaction["conversationActive"] = _currentConvXml != null;
        interaction["currentConversationNode"] = _currentNodeId ?? "";
        try
        {
            var popupType = typeof(XRL.UI.Popup);
            bool popupActive = false;
            foreach (var fname in new[] { "Visible", "_visible", "bVisible", "IsShowing", "Active" })
            {
                var f = popupType.GetField(fname, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
                if (f != null && f.FieldType == typeof(bool))
                {
                    popupActive = (bool)f.GetValue(null);
                    break;
                }
                var p = popupType.GetProperty(fname, BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static);
                if (p != null && p.PropertyType == typeof(bool))
                {
                    popupActive = (bool)p.GetValue(null);
                    break;
                }
            }
            interaction["popupActive"] = popupActive;
        }
        catch { interaction["popupActive"] = false; }
        interaction["blocking"] = false; // Will be refined later
        state["interaction"] = interaction;

        // HP change events (Change 2)
        int currentHp = player.Statistics?.ContainsKey("Hitpoints") == true ? player.Statistics["Hitpoints"].Value : 0;
        if (_lastHp >= 0 && currentHp < _lastHp)
        {
            EmitEvent("damage.taken", new Dictionary<string, object>
            {
                ["amount"] = _lastHp - currentHp,
                ["oldHp"] = _lastHp,
                ["newHp"] = currentHp
            });
        }
        else if (_lastHp >= 0 && currentHp > _lastHp)
        {
            EmitEvent("healed", new Dictionary<string, object>
            {
                ["amount"] = currentHp - _lastHp,
                ["oldHp"] = _lastHp,
                ["newHp"] = currentHp
            });
        }
        _lastHp = currentHp;

        // Flush events to state and events.jsonl (Change 2)
        state["events"] = _pendingEvents.ToList();
        try
        {
            string eventsPath = Path.Combine(IpcDir, "events.jsonl");
            foreach (var evt in _pendingEvents)
            {
                File.AppendAllText(eventsPath, JsonConvert.SerializeObject(evt) + "\n");
            }
        }
        catch { }
        _pendingEvents.Clear();

        // Write atomically
        string json = JsonConvert.SerializeObject(state, Formatting.Indented);
        string tmp = StatePath + ".tmp";
        File.WriteAllText(tmp, json);
        if (File.Exists(StatePath)) File.Delete(StatePath);
        File.Move(tmp, StatePath);
    }

    /// <summary>
    /// Poll for and process command files.
    /// </summary>
    static void ProcessCommands(GameObject player)
    {
        // Debug: log every call
        try { File.AppendAllText(Path.Combine(IpcDir, "debug.log"),
            $"[{DateTime.Now}] ProcessCommands called. CommandPath={CommandPath} Exists={File.Exists(CommandPath)}\n"); }
        catch { }

        if (!File.Exists(CommandPath)) return;

        string command;
        try { command = File.ReadAllText(CommandPath).Trim(); File.Delete(CommandPath); }
        catch (Exception ex) {
            try { File.AppendAllText(Path.Combine(IpcDir, "debug.log"), $"  Read error: {ex.Message}\n"); } catch {}
            return;
        }
        if (string.IsNullOrEmpty(command)) return;

        try { File.AppendAllText(Path.Combine(IpcDir, "debug.log"), $"  Executing: {command}\n"); } catch {}

        var result = ExecuteCommand(player, command);
        File.WriteAllText(ResultPath, JsonConvert.SerializeObject(result, Formatting.Indented));
    }

    /// <summary>
    /// A* pathfinding — returns list of direction strings from start to target.
    /// </summary>
    static List<string> FindPath(Zone zone, int sx, int sy, int tx, int ty, GameObject player, int maxSteps = 80)
    {
        if (zone == null) return null;
        var open = new List<(int x, int y, int g, int h, List<string> path)>();
        var closed = new HashSet<(int, int)>();

        int H(int x, int y) => Math.Abs(x - tx) + Math.Abs(y - ty);
        open.Add((sx, sy, 0, H(sx, sy), new List<string>()));

        string[] dirs = { "N", "NE", "E", "SE", "S", "SW", "W", "NW" };
        int[] dx = { 0, 1, 1, 1, 0, -1, -1, -1 };
        int[] dy = { -1, -1, 0, 1, 1, 1, 0, -1 };

        while (open.Count > 0)
        {
            // Sort by f = g + h
            open.Sort((a, b) => (a.g + a.h).CompareTo(b.g + b.h));
            var current = open[0];
            open.RemoveAt(0);

            if (current.x == tx && current.y == ty) return current.path;
            if (current.g >= maxSteps) continue;
            if (closed.Contains((current.x, current.y))) continue;
            closed.Add((current.x, current.y));

            for (int i = 0; i < 8; i++)
            {
                int nx = current.x + dx[i], ny = current.y + dy[i];
                if (closed.Contains((nx, ny))) continue;
                var cell = zone.GetCell(nx, ny);
                if (cell == null || cell.IsSolid()) continue;
                // Check for hostile creatures blocking the path (but allow target cell)
                if (!(nx == tx && ny == ty))
                {
                    bool hasBlocker = false;
                    foreach (var obj in cell.GetObjectsInCell())
                        if (obj.Brain != null && obj.IsCombatObject() && player != null && obj.Brain.IsHostileTowards(player)) { hasBlocker = true; break; }
                    if (hasBlocker) continue;
                }
                var newPath = new List<string>(current.path) { dirs[i] };
                open.Add((nx, ny, current.g + 1, H(nx, ny), newPath));
            }
        }
        return null; // No path found
    }

    /// <summary>
    /// Find a named entity in the zone.
    /// </summary>
    static GameObject FindEntity(GameObject player, string name)
    {
        var zone = player.CurrentCell?.ParentZone;
        if (zone == null || string.IsNullOrEmpty(name)) return null;
        GameObject best = null;
        int bestDist = int.MaxValue;
        foreach (var obj in zone.GetObjects())
        {
            if (obj == player) continue;
            var dn = obj.DisplayName;
            if (dn != null && dn.IndexOf(name, StringComparison.OrdinalIgnoreCase) >= 0)
            {
                int d = player.DistanceTo(obj);
                if (d < bestDist) { bestDist = d; best = obj; }
            }
        }
        return best;
    }

    /// <summary>
    /// Extract choices from an XML conversation node.
    /// </summary>
    static List<Dictionary<string, string>> ReadChoicesFromNode(System.Xml.XmlNode nodeEl)
    {
        var choices = new List<Dictionary<string, string>>();
        // Get player for variable resolution
        GameObject contextPlayer = null;
        try { contextPlayer = XRLCore.Core?.Game?.Player?.Body; } catch { }

        int idx = 0;
        foreach (System.Xml.XmlNode choiceEl in nodeEl.SelectNodes("choice"))
        {
            // Skip choices whose conditions aren't met
            if (!EvaluateConversationConditions(choiceEl)) continue;

            string ct = choiceEl.InnerText?.Trim() ?? "";
            if (string.IsNullOrEmpty(ct)) { var t = choiceEl.SelectSingleNode("text"); ct = t?.InnerText?.Trim() ?? ""; }
            ct = ConsoleLib.Console.ColorUtility.StripFormatting(ct.Split('~')[0].Trim());
            ct = ResolveTextVariables(ct, contextPlayer);
            string tgt = choiceEl.Attributes?["Target"]?.Value
                      ?? choiceEl.Attributes?["GotoID"]?.Value
                      ?? "End";
            if (!string.IsNullOrEmpty(ct))
            {
                choices.Add(new Dictionary<string, string>
                { ["index"] = idx.ToString(), ["text"] = ct, ["target"] = tgt });
                idx++;
            }
        }
        return choices;
    }

    /// <summary>
    /// Process QuestHandler parts on an XML node element and execute quest actions.
    /// Returns a list of quest action descriptions taken.
    /// </summary>
    static List<Dictionary<string, object>> ProcessQuestHandlers(System.Xml.XmlNode xmlElement)
    {
        var actions = new List<Dictionary<string, object>>();
        if (xmlElement == null) return actions;

        var partNodes = xmlElement.SelectNodes("part[@Name='QuestHandler']");
        if (partNodes == null || partNodes.Count == 0) return actions;

        foreach (System.Xml.XmlNode partNode in partNodes)
        {
            try
            {
                string questId = partNode.Attributes?["QuestID"]?.Value;
                string stepId = partNode.Attributes?["StepID"]?.Value;
                string actionStr = partNode.Attributes?["Action"]?.Value?.ToLowerInvariant() ?? "";
                int xp = -1;
                var xpAttr = partNode.Attributes?["XP"]?.Value;
                if (xpAttr != null) int.TryParse(xpAttr, out xp);

                if (string.IsNullOrEmpty(questId)) continue;

                var actionInfo = new Dictionary<string, object>
                {
                    ["questId"] = questId,
                    ["action"] = actionStr,
                    ["stepId"] = stepId ?? "",
                    ["xp"] = xp
                };

                try
                {
                    // Try direct call first, fall back to reflection
                    var game = The.Game;
                    if (game != null)
                    {
                        bool called = false;
                        if (actionStr == "start")
                        {
                            try
                            {
                                game.StartQuest(questId, _lastSpeakerName);
                                called = true;
                            }
                            catch
                            {
                                // Reflection fallback
                                var m = game.GetType().GetMethod("StartQuest", BindingFlags.Public | BindingFlags.Instance);
                                if (m != null) { m.Invoke(game, new object[] { questId, _lastSpeakerName }); called = true; }
                            }
                            if (called)
                            {
                                actionInfo["result"] = "started";
                                EmitEvent("quest.started", new Dictionary<string, object>
                                {
                                    ["questId"] = questId,
                                    ["speaker"] = _lastSpeakerName ?? ""
                                });
                            }
                        }
                        else if (actionStr == "step")
                        {
                            try
                            {
                                game.FinishQuestStep(questId, stepId, xp);
                                called = true;
                            }
                            catch
                            {
                                var m = game.GetType().GetMethod("FinishQuestStep", BindingFlags.Public | BindingFlags.Instance);
                                if (m != null) { m.Invoke(game, new object[] { questId, stepId, xp }); called = true; }
                            }
                            if (called)
                            {
                                actionInfo["result"] = "step_completed";
                                EmitEvent("quest.step", new Dictionary<string, object>
                                {
                                    ["questId"] = questId,
                                    ["stepId"] = stepId ?? ""
                                });
                            }
                        }
                        else if (actionStr == "finish")
                        {
                            try
                            {
                                game.FinishQuest(questId);
                                called = true;
                            }
                            catch
                            {
                                var m = game.GetType().GetMethod("FinishQuest", BindingFlags.Public | BindingFlags.Instance);
                                if (m != null) { m.Invoke(game, new object[] { questId }); called = true; }
                            }
                            if (called)
                            {
                                actionInfo["result"] = "finished";
                                EmitEvent("quest.finished", new Dictionary<string, object> { ["questId"] = questId });
                            }
                        }
                        else if (actionStr == "complete")
                        {
                            try
                            {
                                game.CompleteQuest(questId);
                                called = true;
                            }
                            catch
                            {
                                var m = game.GetType().GetMethod("CompleteQuest", BindingFlags.Public | BindingFlags.Instance);
                                if (m != null) { m.Invoke(game, new object[] { questId }); called = true; }
                            }
                            if (called)
                            {
                                actionInfo["result"] = "completed";
                                EmitEvent("quest.completed", new Dictionary<string, object> { ["questId"] = questId });
                            }
                        }

                        if (!called) actionInfo["result"] = "unknown_action";
                    }
                    else
                    {
                        actionInfo["result"] = "no_game_instance";
                    }
                }
                catch (Exception ex)
                {
                    actionInfo["result"] = "error";
                    actionInfo["error"] = ex.Message;
                }

                actions.Add(actionInfo);
            }
            catch { }
        }
        return actions;
    }

    /// <summary>
    /// Process item-related conversation parts (ReceiveItem, TakeItem, GiveArtifact) on an XML element.
    /// Returns a list of item action descriptions.
    /// </summary>
    static List<Dictionary<string, object>> ProcessConversationItemParts(System.Xml.XmlNode xmlElement, GameObject player)
    {
        var actions = new List<Dictionary<string, object>>();
        if (xmlElement == null || player == null) return actions;

        // Process ReceiveItem parts — give items to the player
        foreach (System.Xml.XmlNode part in xmlElement.SelectNodes("part[@Name='ReceiveItem']"))
        {
            try
            {
                string blueprints = part.Attributes?["Blueprints"]?.Value;
                string identify = part.Attributes?["Identify"]?.Value ?? "";
                if (string.IsNullOrEmpty(blueprints)) continue;

                var received = new List<string>();
                foreach (string bp in blueprints.Split(','))
                {
                    string bpTrimmed = bp.Trim();
                    if (string.IsNullOrEmpty(bpTrimmed)) continue;
                    try
                    {
                        // Create item from blueprint and add to player inventory
                        var item = GameObject.create(bpTrimmed);
                        if (item != null)
                        {
                            player.Inventory.AddObject(item);
                            string itemName = ConsoleLib.Console.ColorUtility.StripFormatting(item.DisplayName ?? bpTrimmed);
                            received.Add(itemName);

                            // Identify if requested
                            if (identify == "All" || identify == "*" ||
                                identify.Split(',').Any(i => i.Trim() == bpTrimmed))
                            {
                                try { item.MakeUnderstood(); } catch { }
                            }
                        }
                    }
                    catch { received.Add(bpTrimmed + " (create failed)"); }
                }
                actions.Add(new Dictionary<string, object>
                {
                    ["type"] = "receive_item",
                    ["items"] = received,
                    ["result"] = received.Count > 0 ? "ok" : "failed"
                });
                if (received.Count > 0)
                {
                    EmitEvent("item.received", new Dictionary<string, object>
                    {
                        ["items"] = received,
                        ["source"] = "conversation"
                    });
                }
            }
            catch { }
        }

        // Process TakeItem parts — remove items from the player
        foreach (System.Xml.XmlNode part in xmlElement.SelectNodes("part[@Name='TakeItem']"))
        {
            try
            {
                string blueprints = part.Attributes?["Blueprints"]?.Value;
                int amount = 1;
                int.TryParse(part.Attributes?["Amount"]?.Value, out amount);
                if (amount <= 0) amount = 1;
                if (string.IsNullOrEmpty(blueprints)) continue;

                var taken = new List<string>();
                foreach (string bp in blueprints.Split(','))
                {
                    string bpTrimmed = bp.Trim();
                    if (player.Inventory?.Objects == null) break;
                    int remaining = amount;
                    foreach (var item in player.Inventory.Objects.ToList())
                    {
                        if (remaining <= 0) break;
                        if (item.Blueprint == bpTrimmed || (item.DisplayName?.Contains(bpTrimmed) == true))
                        {
                            string itemName = ConsoleLib.Console.ColorUtility.StripFormatting(item.DisplayName ?? bpTrimmed);
                            item.Destroy();
                            taken.Add(itemName);
                            remaining--;
                        }
                    }
                }
                actions.Add(new Dictionary<string, object>
                {
                    ["type"] = "take_item",
                    ["items"] = taken,
                    ["result"] = taken.Count > 0 ? "ok" : "not_found"
                });
            }
            catch { }
        }

        return actions;
    }

    /// <summary>
    /// Check a quest condition via The.Game API. Returns false if the method doesn't exist or throws.
    /// </summary>
    static bool CheckQuestCondition(string methodName, params object[] args)
    {
        try
        {
            var game = The.Game;
            if (game == null) return false;
            var m = game.GetType().GetMethod(methodName, BindingFlags.Public | BindingFlags.Instance);
            if (m != null)
            {
                var result = m.Invoke(game, args);
                return result is bool b && b;
            }
        }
        catch { }
        return false;
    }

    /// <summary>
    /// Evaluate conditional attributes on a conversation XML node (IfHaveQuest, IfNotHaveQuest, etc.).
    /// Returns true if all conditions are met (or no conditions exist).
    /// </summary>
    static bool EvaluateConversationConditions(System.Xml.XmlNode node)
    {
        if (node?.Attributes == null) return true;

        string val;

        val = node.Attributes["IfHaveQuest"]?.Value;
        if (val != null && !CheckQuestCondition("HasQuest", val)) return false;

        val = node.Attributes["IfNotHaveQuest"]?.Value;
        if (val != null && CheckQuestCondition("HasQuest", val)) return false;

        val = node.Attributes["IfFinishedQuest"]?.Value;
        if (val != null && !CheckQuestCondition("HasFinishedQuest", val)) return false;

        val = node.Attributes["IfHaveActiveQuest"]?.Value;
        if (val != null && !CheckQuestCondition("HasActiveQuest", val)) return false;

        val = node.Attributes["IfFinishedQuestStep"]?.Value;
        if (val != null)
        {
            var parts = val.Split('~');
            if (parts.Length >= 2 && !CheckQuestCondition("FinishedQuestStep", parts[0], parts[1])) return false;
        }

        val = node.Attributes["IfNotFinishedQuestStep"]?.Value;
        if (val != null)
        {
            var parts = val.Split('~');
            if (parts.Length >= 2 && CheckQuestCondition("FinishedQuestStep", parts[0], parts[1])) return false;
        }

        return true;
    }

    /// <summary>
    /// Find the best start node in a conversation by evaluating conditions on all start/node elements.
    /// Returns the first node whose conditions are met, falling back to an unconditional start.
    /// </summary>
    static System.Xml.XmlNode FindBestStartNode(System.Xml.XmlNode convNode)
    {
        if (convNode == null) return null;

        // Gather all <start> and <node> elements that could serve as entry points
        // Priority: conditional <start> nodes first (most specific match), then unconditional
        var startNodes = convNode.SelectNodes("start");
        var nodeNodes = convNode.SelectNodes("node");

        // First pass: find a conditional start whose conditions are ALL met
        if (startNodes != null)
        {
            foreach (System.Xml.XmlNode s in startNodes)
            {
                if (s.Attributes != null && HasAnyCondition(s) && EvaluateConversationConditions(s))
                    return s;
            }
        }
        // Also check <node> elements with ID="Start*" that have conditions
        if (nodeNodes != null)
        {
            foreach (System.Xml.XmlNode n in nodeNodes)
            {
                string id = n.Attributes?["ID"]?.Value ?? "";
                if (id.StartsWith("Start") && HasAnyCondition(n) && EvaluateConversationConditions(n))
                    return n;
            }
        }

        // Second pass: unconditional start node (no quest conditions)
        if (startNodes != null)
        {
            foreach (System.Xml.XmlNode s in startNodes)
            {
                if (!HasAnyCondition(s)) return s;
            }
        }

        // Final fallback: first start or node[@ID='Start']
        return convNode.SelectSingleNode("start") ?? convNode.SelectSingleNode("node[@ID='Start']");
    }

    static bool HasAnyCondition(System.Xml.XmlNode node)
    {
        if (node?.Attributes == null) return false;
        return node.Attributes["IfHaveQuest"] != null
            || node.Attributes["IfNotHaveQuest"] != null
            || node.Attributes["IfFinishedQuest"] != null
            || node.Attributes["IfHaveActiveQuest"] != null
            || node.Attributes["IfFinishedQuestStep"] != null
            || node.Attributes["IfNotFinishedQuestStep"] != null;
    }

    /// <summary>
    /// Process quest-related ATTRIBUTES on a choice or node element (StartQuest, CompleteQuestStep, FinishQuest).
    /// These are separate from QuestHandler parts — they're the primary quest trigger mechanism.
    /// </summary>
    static List<Dictionary<string, object>> ProcessChoiceQuestAttributes(System.Xml.XmlNode element)
    {
        var actions = new List<Dictionary<string, object>>();
        if (element?.Attributes == null) return actions;

        var game = The.Game;
        if (game == null) return actions;

        // StartQuest attribute
        string startQuest = element.Attributes["StartQuest"]?.Value;
        if (startQuest != null)
        {
            try
            {
                // StartQuest(String, String, String, String) — questId, speaker, ?, ?
                // Try the 4-param string version first, fall back to 2-param
                bool called = false;
                try
                {
                    var m4 = game.GetType().GetMethod("StartQuest",
                        new[] { typeof(string), typeof(string), typeof(string), typeof(string) });
                    if (m4 != null)
                    {
                        m4.Invoke(game, new object[] { startQuest, _lastSpeakerName ?? "", null, null });
                        called = true;
                    }
                }
                catch { }
                if (!called)
                {
                    // Try 2-param version as fallback
                    try { game.StartQuest(startQuest, _lastSpeakerName); called = true; } catch { }
                }
                actions.Add(new Dictionary<string, object>
                {
                    ["questId"] = startQuest, ["action"] = "start", ["result"] = called ? "started" : "no_method"
                });
                if (called)
                {
                    EmitEvent("quest.started", new Dictionary<string, object>
                    {
                        ["questId"] = startQuest, ["speaker"] = _lastSpeakerName ?? "", ["source"] = "choice_attribute"
                    });
                }
            }
            catch (Exception ex)
            {
                actions.Add(new Dictionary<string, object>
                {
                    ["questId"] = startQuest, ["action"] = "start", ["result"] = "error", ["error"] = ex.Message
                });
            }
        }

        // CompleteQuestStep attribute (format: "QuestID~StepID")
        string completeStep = element.Attributes["CompleteQuestStep"]?.Value;
        if (completeStep != null)
        {
            var parts = completeStep.Split('~');
            if (parts.Length >= 2)
            {
                try
                {
                    // FinishQuestStep(String, String, Int32, Boolean, String) — 5 params
                    bool called = false;
                    try
                    {
                        var m = game.GetType().GetMethod("FinishQuestStep",
                            new[] { typeof(string), typeof(string), typeof(int), typeof(bool), typeof(string) });
                        if (m != null) { m.Invoke(game, new object[] { parts[0], parts[1], 0, false, null }); called = true; }
                    }
                    catch { }
                    if (!called) { try { game.FinishQuestStep(parts[0], parts[1]); called = true; } catch { } }

                    actions.Add(new Dictionary<string, object>
                    {
                        ["questId"] = parts[0], ["stepId"] = parts[1], ["action"] = "step", ["result"] = called ? "step_completed" : "no_method"
                    });
                    if (called) EmitEvent("quest.step", new Dictionary<string, object>
                    {
                        ["questId"] = parts[0], ["stepId"] = parts[1], ["source"] = "choice_attribute"
                    });
                }
                catch (Exception ex)
                {
                    actions.Add(new Dictionary<string, object>
                    {
                        ["questId"] = parts[0], ["action"] = "step", ["result"] = "error", ["error"] = ex.Message
                    });
                }
            }
        }

        // FinishQuest attribute
        string finishQuest = element.Attributes["FinishQuest"]?.Value;
        if (finishQuest != null)
        {
            try
            {
                game.FinishQuest(finishQuest);
                actions.Add(new Dictionary<string, object>
                {
                    ["questId"] = finishQuest, ["action"] = "finish", ["result"] = "finished"
                });
                EmitEvent("quest.finished", new Dictionary<string, object>
                {
                    ["questId"] = finishQuest, ["source"] = "choice_attribute"
                });
            }
            catch (Exception ex)
            {
                actions.Add(new Dictionary<string, object>
                {
                    ["questId"] = finishQuest, ["action"] = "finish", ["result"] = "error", ["error"] = ex.Message
                });
            }
        }

        return actions;
    }

    /// <summary>
    /// Resolve =variable= template macros in conversation text using GameText.VariableReplace.
    /// Falls back to raw text if the API isn't available.
    /// </summary>
    static string ResolveTextVariables(string text, GameObject contextObject = null)
    {
        if (string.IsNullOrEmpty(text) || !text.Contains("=")) return text;
        try
        {
            var gameTextType = typeof(XRL.Core.XRLCore).Assembly.GetType("XRL.GameText");
            if (gameTextType != null)
            {
                // Try the full signature: VariableReplace(string, string, bool, string, bool, bool)
                var methods = gameTextType.GetMethods(BindingFlags.Public | BindingFlags.Static);
                System.Reflection.MethodInfo varReplace = null;
                foreach (var m in methods)
                {
                    if (m.Name == "VariableReplace" && m.GetParameters().Length >= 2)
                    {
                        varReplace = m;
                        break;
                    }
                }
                if (varReplace != null)
                {
                    var parms = varReplace.GetParameters();
                    // Build args array matching the parameter count
                    object[] args;
                    if (parms.Length >= 6)
                        args = new object[] { text, contextObject?.id, false, null, false, true };
                    else if (parms.Length >= 2)
                        args = new object[] { text, contextObject?.id };
                    else
                        args = new object[] { text };

                    var result = varReplace.Invoke(null, args) as string;
                    if (result != null) return result;
                }
            }
        }
        catch { }
        return text;
    }

    /// <summary>
    /// Execute a command from the agent.
    /// </summary>
    public static Dictionary<string, object> ExecuteCommand(GameObject player, string command)
    {
        var result = new Dictionary<string, object> { ["command"] = command };

        string[] parts = command.Split(new[] { ' ' }, 2);
        string action = parts[0].ToLower();
        string args = parts.Length > 1 ? parts[1] : "";

        if (action == "move" || action == "go")
        {
            var dirMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                ["n"]="N",["s"]="S",["e"]="E",["w"]="W",
                ["ne"]="NE",["nw"]="NW",["se"]="SE",["sw"]="SW",
                ["north"]="N",["south"]="S",["east"]="E",["west"]="W",
                ["u"]="U",["d"]="D",["up"]="U",["down"]="D"
            };
            if (dirMap.TryGetValue(args.Trim(), out string dir))
            {
                // Use Move() instead of DirectMoveTo — handles zone transitions,
                // combat engagement, and all game logic properly
                string oldZone = player.CurrentCell?.ParentZone?.ZoneID;
                bool moved = player.Move(dir, Forced: false);
                if (moved)
                {
                    result["status"] = "ok";
                    result["moved"] = dir;
                    // Consume energy so the turn actually advances
                    player.UseEnergy(1000);

                    // Emit zone.entered event if zone changed (Change 2)
                    string newZone = player.CurrentCell?.ParentZone?.ZoneID;
                    if (oldZone != null && newZone != null && oldZone != newZone)
                    {
                        EmitEvent("zone.entered", new Dictionary<string, object>
                        {
                            ["oldZone"] = oldZone,
                            ["newZone"] = newZone,
                            ["newZoneName"] = player.CurrentCell?.ParentZone?.DisplayName ?? "unknown"
                        });
                    }
                }
                else
                {
                    result["status"] = "blocked";
                    result["message"] = "Cannot move " + dir;
                }
            }
            else { result["status"] = "error"; result["message"] = "Unknown direction: " + args; }
        }
        else if (action == "wait")
        {
            player.UseEnergy(1000);
            result["status"] = "ok";
        }
        else if (action == "look") { result["status"] = "ok"; result["zone"] = player.CurrentCell?.ParentZone?.DisplayName; }
        else if (action == "attack" || action == "kill")
        {
            // Find nearest hostile and attack
            var zone = player.CurrentCell?.ParentZone;
            XRL.World.GameObject target = null;
            int bestDist = int.MaxValue;
            if (zone != null)
            {
                foreach (var obj in zone.GetObjects())
                {
                    if (obj == player || obj.Brain == null) continue;
                    if (!string.IsNullOrEmpty(args))
                    {
                        if (obj.DisplayName?.IndexOf(args, StringComparison.OrdinalIgnoreCase) < 0) continue;
                    }
                    else if (!obj.Brain.IsHostileTowards(player)) continue;
                    int dist = player.DistanceTo(obj);
                    if (dist < bestDist) { bestDist = dist; target = obj; }
                }
            }
            if (target != null)
            {
                string targetName = ConsoleLib.Console.ColorUtility.StripFormatting(target.DisplayName);
                result["target"] = targetName;
                result["distance"] = bestDist;

                if (bestDist <= 1 && target.CurrentCell != null && player.CurrentCell != null)
                {
                    // Adjacent — calculate direction and fire directional attack
                    int dx = target.CurrentCell.X - player.CurrentCell.X;
                    int dy = target.CurrentCell.Y - player.CurrentCell.Y;
                    string dir = "";
                    if (dy < 0) dir += "N";
                    else if (dy > 0) dir += "S";
                    if (dx > 0) dir += "E";
                    else if (dx < 0) dir += "W";
                    if (string.IsNullOrEmpty(dir)) dir = "N"; // same cell fallback

                    // Set target and fire the directional attack command
                    player.Target = target;
                    try
                    {
                        // CmdAttackDirection fires the full melee attack chain
                        var attackEvent = XRL.World.Event.New("CommandAttackDirection", "Direction", dir);
                        player.FireEvent(attackEvent);
                        player.UseEnergy(1000);
                        result["status"] = "ok";
                        result["attacked"] = true;
                        result["direction"] = dir;
                    }
                    catch
                    {
                        // Fallback: move into the target (triggers melee automatically)
                        bool moved = player.Move(dir, Forced: false);
                        player.UseEnergy(1000);
                        result["status"] = "ok";
                        result["attacked"] = moved;
                        result["direction"] = dir;
                        result["method"] = "move_into";
                    }
                }
                else if (bestDist > 1)
                {
                    // Not adjacent — pathfind to target first, then attack
                    player.Target = target;
                    var path = FindPath(player.CurrentCell.ParentZone,
                        player.CurrentCell.X, player.CurrentCell.Y,
                        target.CurrentCell.X, target.CurrentCell.Y, player, 80);
                    if (path != null && path.Count > 1)
                    {
                        // Walk toward target (stop 1 tile away)
                        int stepsToTake = Math.Min(path.Count - 1, 79);
                        int stepsTaken = 0;
                        for (int i = 0; i < stepsToTake; i++)
                        {
                            bool moved = player.Move(path[i], Forced: false);
                            if (!moved) break;
                            player.UseEnergy(1000);
                            stepsTaken++;
                        }
                        // If now adjacent, swing
                        if (player.DistanceTo(target) <= 1 && target.CurrentCell != null)
                        {
                            int dx2 = target.CurrentCell.X - player.CurrentCell.X;
                            int dy2 = target.CurrentCell.Y - player.CurrentCell.Y;
                            string dir2 = "";
                            if (dy2 < 0) dir2 += "N"; else if (dy2 > 0) dir2 += "S";
                            if (dx2 > 0) dir2 += "E"; else if (dx2 < 0) dir2 += "W";
                            if (string.IsNullOrEmpty(dir2)) dir2 = "N";
                            player.Move(dir2, Forced: false);
                            player.UseEnergy(1000);
                            result["attacked"] = true;
                        }
                        result["status"] = "ok";
                        result["steps"] = stepsTaken;
                    }
                    else
                    {
                        result["status"] = "error";
                        result["message"] = "Cannot path to " + targetName;
                    }
                }

                EmitEvent("combat.attack", new Dictionary<string, object>
                {
                    ["target"] = targetName,
                    ["targetId"] = target.id ?? target.GetHashCode().ToString(),
                    ["distance"] = bestDist,
                    ["attacked"] = result.ContainsKey("attacked") && (bool)result["attacked"]
                });
            }
            else
            {
                result["status"] = "error";
                result["message"] = "No target found";
            }
        }
        else if (action == "navigate" || action == "goto")
        {
            // Full A* pathfinding. Accepts coordinates or NPC name.
            // "navigate 38 3" or "navigate Elder Irudad"
            int tx = -1, ty = -1;
            string targetName = null;
            var coords = args.Trim().Split(' ');
            if (coords.Length >= 2 && int.TryParse(coords[0], out tx) && int.TryParse(coords[1], out ty))
            {
                // Coordinate target
            }
            else
            {
                // Name target — find entity
                var target = FindEntity(player, args.Trim());
                if (target?.CurrentCell != null)
                {
                    tx = target.CurrentCell.X;
                    ty = target.CurrentCell.Y;
                    targetName = ConsoleLib.Console.ColorUtility.StripFormatting(target.DisplayName);
                }
            }

            if (tx >= 0 && ty >= 0)
            {
                int px = player.CurrentCell.X, py = player.CurrentCell.Y;
                if (px == tx && py == ty) { result["status"] = "ok"; result["message"] = "Already at target"; }
                else
                {
                    // Try pathfinding to the target or adjacent cells
                    var path = FindPath(player.CurrentCell.ParentZone, px, py, tx, ty, player, 80);
                    // If no direct path, try adjacent cells
                    if (path == null || path.Count == 0)
                    {
                        int[] adx = {0,1,1,1,0,-1,-1,-1};
                        int[] ady = {-1,-1,0,1,1,1,0,-1};
                        for (int ai = 0; ai < 8 && (path == null || path.Count == 0); ai++)
                        {
                            path = FindPath(player.CurrentCell.ParentZone, px, py, tx+adx[ai], ty+ady[ai], player, 80);
                        }
                    }

                    if (path != null && path.Count > 0)
                    {
                        int steps = 0;
                        foreach (var dir in path)
                        {
                            if (steps >= 100) break;
                            bool moved = player.Move(dir, Forced: false);
                            if (!moved) break;
                            player.UseEnergy(1000);
                            steps++;
                        }
                        result["status"] = "ok";
                        result["steps"] = steps;
                        result["totalPath"] = path.Count;
                        if (targetName != null) result["target"] = targetName;
                        result["arrived"] = Math.Abs(player.CurrentCell.X - tx) <= 1 && Math.Abs(player.CurrentCell.Y - ty) <= 1;
                    }
                    else { result["status"] = "error"; result["message"] = "No path found to (" + tx + "," + ty + ")"; }
                }
            }
            else { result["status"] = "error"; result["message"] = "Target not found: " + args; }
        }
        else if (action == "talkto")
        {
            // Clear any stale conversation state before starting a new one
            _currentConvXml = null;
            _currentNodeId = null;

            // Navigate to NPC + initiate conversation, all in one command
            var target = FindEntity(player, args.Trim());
            if (target?.CurrentCell != null)
            {
                int tx = target.CurrentCell.X, ty = target.CurrentCell.Y;
                string npcName = ConsoleLib.Console.ColorUtility.StripFormatting(target.DisplayName);

                // Pathfind to adjacent cell (use full navigate budget)
                int dist = player.DistanceTo(target);
                if (dist > 1)
                {
                    var path = FindPath(player.CurrentCell.ParentZone, player.CurrentCell.X, player.CurrentCell.Y, tx, ty, player, 80);
                    // Try adjacent cells if direct path fails
                    if (path == null || path.Count == 0)
                    {
                        int[] adx = {0,1,1,1,0,-1,-1,-1};
                        int[] ady = {-1,-1,0,1,1,1,0,-1};
                        for (int ai = 0; ai < 8 && (path == null || path.Count == 0); ai++)
                            path = FindPath(player.CurrentCell.ParentZone, player.CurrentCell.X, player.CurrentCell.Y, tx+adx[ai], ty+ady[ai], player, 80);
                    }
                    if (path != null && path.Count > 1)
                    {
                        for (int i = 0; i < path.Count - 1 && i < 80; i++)
                        {
                            bool moved = player.Move(path[i], Forced: false);
                            if (!moved) break;
                            player.UseEnergy(1000);
                        }
                    }
                }

                result["npc"] = npcName;
                _lastSpeakerName = npcName;
                result["distance"] = player.DistanceTo(target);

                // Mark as error if we couldn't get adjacent
                if (player.DistanceTo(target) > 1)
                {
                    result["status"] = "error";
                    result["message"] = "Could not reach " + npcName + " (distance: " + player.DistanceTo(target) + ")";
                }
                else
                {
                    result["status"] = "ok";
                }

                // If adjacent, try to read conversation
                if (player.DistanceTo(target) <= 1 && target.HasPart("ConversationScript"))
                {
                    string convId = null;
                    try
                    {
                        var cs = target.GetPart("ConversationScript");
                        convId = cs?.GetType().GetField("ConversationID")?.GetValue(cs) as string;
                    }
                    catch { }
                    result["conversationId"] = convId ?? "unknown";

                    if (convId != null)
                    {
                        try
                        {
                            string convXmlPath = Path.Combine(UE.Application.streamingAssetsPath, "Base", "Conversations.xml");
                            var doc = new System.Xml.XmlDocument();
                            doc.Load(convXmlPath);
                            var convNode = doc.SelectSingleNode($"//conversation[@ID='{convId}']");
                            if (convNode != null)
                            {
                                var startEl = FindBestStartNode(convNode);
                                if (startEl != null)
                                {
                                    var textEl = startEl.SelectSingleNode("text");
                                    // Find the best text element (check conditions on <text> too)
                                    string rawText = "";
                                    var textNodes = startEl.SelectNodes("text");
                                    if (textNodes != null && textNodes.Count > 1)
                                    {
                                        foreach (System.Xml.XmlNode tn in textNodes)
                                        {
                                            if (EvaluateConversationConditions(tn)) { rawText = tn.InnerText?.Trim() ?? ""; break; }
                                        }
                                        if (string.IsNullOrEmpty(rawText)) rawText = textEl?.InnerText?.Trim() ?? "";
                                    }
                                    else rawText = textEl?.InnerText?.Trim() ?? "";

                                    rawText = ConsoleLib.Console.ColorUtility.StripFormatting(rawText.Split('~')[0].Trim());
                                    result["npcText"] = ResolveTextVariables(rawText, player);
                                    result["choices"] = ReadChoicesFromNode(startEl);
                                    _currentConvXml = convNode;
                                    _currentNodeId = startEl.Attributes?["ID"]?.Value ?? "Start";
                                }
                            }
                        }
                        catch (Exception ex) { result["message"] = "Conversation error: " + ex.Message; }
                    }
                }
                else if (player.DistanceTo(target) <= 1)
                {
                    result["message"] = npcName + " has no conversation";
                }
            }
            else { result["status"] = "error"; result["message"] = "NPC not found: " + args; }
        }
        else if (action == "equip")
        {
            // Equip an item from inventory by name
            if (player.Inventory?.Objects != null)
            {
                foreach (var item in player.Inventory.Objects)
                {
                    if (item.DisplayName?.IndexOf(args, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        try
                        {
                            player.ForceEquipObject(item, (string)null);
                            result["status"] = "ok";
                            result["equipped"] = ConsoleLib.Console.ColorUtility.StripFormatting(item.DisplayName);
                        }
                        catch { result["status"] = "error"; result["message"] = "Cannot equip: " + item.DisplayName; }
                        break;
                    }
                }
                if (!result.ContainsKey("equipped") && !result.ContainsKey("message"))
                    result["message"] = "Item not found in inventory: " + args;
            }
        }
        else if (action == "useitem")
        {
            // Use a specific inventory item by name
            if (player.Inventory?.Objects != null)
            {
                foreach (var item in player.Inventory.Objects)
                {
                    if (item.DisplayName?.IndexOf(args, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        item.FireEvent("InvCommandUse");
                        result["status"] = "ok";
                        result["used"] = ConsoleLib.Console.ColorUtility.StripFormatting(item.DisplayName);
                        break;
                    }
                }
                if (!result.ContainsKey("used"))
                    result["message"] = "Item not found: " + args;
            }
        }
        else if (action == "pickup")
        {
            // Pick up a specific item from the ground by name
            var cell = player.CurrentCell;
            if (cell != null)
            {
                foreach (var obj in cell.GetObjectsInCell())
                {
                    if (obj == player || obj.Brain != null) continue;
                    if (obj.DisplayName?.IndexOf(args, StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        player.TakeObject(obj, Silent: false);
                        result["status"] = "ok";
                        result["picked"] = ConsoleLib.Console.ColorUtility.StripFormatting(obj.DisplayName);
                        break;
                    }
                }
                if (!result.ContainsKey("picked"))
                    result["message"] = "Item not found on ground: " + args;
            }
        }
        else if (action == "examine" || action == "ex")
        {
            // Examine an entity or item by name — checks inventory, equipment, then zone
            if (!string.IsNullOrEmpty(args))
            {
                XRL.World.GameObject found = null;
                string source = null;

                // 1. Check inventory
                if (player.Inventory?.Objects != null)
                {
                    foreach (var item in player.Inventory.Objects)
                    {
                        if (item.DisplayName?.IndexOf(args, StringComparison.OrdinalIgnoreCase) >= 0)
                        { found = item; source = "inventory"; break; }
                    }
                }

                // 2. Check equipped items
                if (found == null)
                {
                    var body = player.GetPart<XRL.World.Parts.Body>();
                    if (body != null)
                    {
                        foreach (var part in body.GetParts())
                        {
                            if (part.Equipped != null && part.Equipped.DisplayName?.IndexOf(args, StringComparison.OrdinalIgnoreCase) >= 0)
                            { found = part.Equipped; source = "equipped (" + part.Name + ")"; break; }
                        }
                    }
                }

                // 3. Check zone objects (nearby first)
                if (found == null)
                {
                    var zone = player.CurrentCell?.ParentZone;
                    if (zone != null)
                    {
                        int bestDist = int.MaxValue;
                        foreach (var obj in zone.GetObjects())
                        {
                            if (obj == player) continue;
                            if (obj.DisplayName?.IndexOf(args, StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                int d = player.DistanceTo(obj);
                                if (d < bestDist) { bestDist = d; found = obj; source = "zone"; }
                            }
                        }
                    }
                }

                if (found != null)
                {
                    result["status"] = "ok";
                    result["source"] = source;
                    result["name"] = ConsoleLib.Console.ColorUtility.StripFormatting(found.DisplayName);
                    try { result["description"] = ConsoleLib.Console.ColorUtility.StripFormatting(found.DisplayName + " — " + (found.GetPart<Description>()?.Short ?? "")); }
                    catch { result["description"] = ConsoleLib.Console.ColorUtility.StripFormatting(found.DisplayName ?? ""); }
                    if (found.Statistics?.ContainsKey("Hitpoints") == true)
                    {
                        result["hp"] = found.Statistics["Hitpoints"].Value;
                        result["maxHp"] = found.Statistics["Hitpoints"].BaseValue;
                    }
                    if (found.CurrentCell != null)
                    {
                        result["distance"] = player.DistanceTo(found);
                        result["position"] = new Dictionary<string, int> { ["x"] = found.CurrentCell.X, ["y"] = found.CurrentCell.Y };
                    }
                }
                else { result["status"] = "error"; result["message"] = "Not found: " + args; }
            }
            else { result["status"] = "error"; result["message"] = "Usage: examine <name>"; }
        }
        else if (action == "eat" || action == "drink")
        {
            // Find and consume a food/drink item from inventory
            if (player.Inventory?.Objects != null)
            {
                foreach (var item in player.Inventory.Objects)
                {
                    string iname = item.DisplayName?.ToLower() ?? "";
                    if (action == "eat" && (iname.Contains("jerky") || iname.Contains("food") || iname.Contains("meal") || iname.Contains("bark")))
                    {
                        item.FireEvent("InvCommandEat");
                        result["status"] = "ok";
                        result["consumed"] = ConsoleLib.Console.ColorUtility.StripFormatting(item.DisplayName);
                        break;
                    }
                    if (action == "drink" && (iname.Contains("water") || iname.Contains("drink") || iname.Contains("waterskin")))
                    {
                        item.FireEvent("InvCommandDrink");
                        result["status"] = "ok";
                        result["consumed"] = ConsoleLib.Console.ColorUtility.StripFormatting(item.DisplayName);
                        break;
                    }
                }
                if (!result.ContainsKey("consumed")) { result["status"] = "error"; result["message"] = "No " + action + "able item found"; }
            }
        }
        else if (action == "talk")
        {
            // Find adjacent NPC and read their conversation data from XML
            XRL.World.GameObject npc = null;
            var checkCells = new List<XRL.World.Cell> { player.CurrentCell };
            checkCells.AddRange(player.CurrentCell.GetLocalAdjacentCells());
            foreach (var c in checkCells)
            {
                foreach (var obj in c.GetObjectsInCell())
                {
                    if (obj == player || obj.Brain == null) continue;
                    if (!string.IsNullOrEmpty(args) && obj.DisplayName?.IndexOf(args, StringComparison.OrdinalIgnoreCase) < 0) continue;
                    if (obj.HasPart("ConversationScript")) { npc = obj; break; }
                }
                if (npc != null) break;
            }

            if (npc != null)
            {
                result["status"] = "ok";
                result["npc"] = ConsoleLib.Console.ColorUtility.StripFormatting(npc.DisplayName ?? "?");
                _lastSpeakerName = ConsoleLib.Console.ColorUtility.StripFormatting(npc.DisplayName ?? "?");

                // Get conversation ID
                string convId = null;
                try
                {
                    var convScript = npc.GetPart("ConversationScript");
                    convId = convScript?.GetType().GetField("ConversationID")?.GetValue(convScript) as string;
                }
                catch { }
                result["conversationId"] = convId ?? "unknown";

                // Load conversation using reflection to discover actual API
                if (convId != null)
                {
                    try
                    {
                        // Read conversation XML with conditional node selection
                        string convXmlPath = System.IO.Path.Combine(
                            UE.Application.streamingAssetsPath, "Base", "Conversations.xml");
                        if (File.Exists(convXmlPath))
                        {
                            var doc = new System.Xml.XmlDocument();
                            doc.Load(convXmlPath);
                            var convNode = doc.SelectSingleNode($"//conversation[@ID='{convId}']");
                            if (convNode != null)
                            {
                                var startEl = FindBestStartNode(convNode);
                                if (startEl != null)
                                {
                                    // Get NPC text (evaluate conditions on <text> elements too)
                                    string npcText = "";
                                    var textNodes = startEl.SelectNodes("text");
                                    if (textNodes != null && textNodes.Count > 1)
                                    {
                                        foreach (System.Xml.XmlNode tn in textNodes)
                                        {
                                            if (EvaluateConversationConditions(tn)) { npcText = tn.InnerText?.Trim() ?? ""; break; }
                                        }
                                        if (string.IsNullOrEmpty(npcText)) npcText = startEl.SelectSingleNode("text")?.InnerText?.Trim() ?? "";
                                    }
                                    else npcText = startEl.SelectSingleNode("text")?.InnerText?.Trim() ?? "";

                                    npcText = ConsoleLib.Console.ColorUtility.StripFormatting(npcText.Split('~')[0].Trim());
                                    result["npcText"] = ResolveTextVariables(npcText, player);
                                    result["choices"] = ReadChoicesFromNode(startEl);
                                    _currentConvXml = convNode;
                                    _currentNodeId = startEl.Attributes?["ID"]?.Value ?? "Start";
                                }
                                else { result["message"] = "No start node in conversation"; }
                            }
                            else { result["message"] = "Conversation ID not found in XML: " + convId; }
                        }
                        else { result["message"] = "Conversations.xml not found"; }
                    }
                    catch (Exception ex) { result["message"] = "Conversation error: " + ex.Message; }
                }
            }
            else
            {
                result["status"] = "error";
                result["message"] = "No talkable NPC adjacent";
            }
        }
        else if (action == "choose")
        {
            // Choose a dialog option by index — navigate conversation XML
            if (_currentConvXml != null && int.TryParse(args.Trim(), out int choiceIdx))
            {
                try
                {
                    // Find current node — search deeply with XPath //
                    var nodeEl = _currentConvXml.SelectSingleNode($".//start[@ID='{_currentNodeId}']")
                              ?? _currentConvXml.SelectSingleNode($".//node[@ID='{_currentNodeId}']")
                              ?? _currentConvXml.SelectSingleNode(".//start[not(@ID)]")
                              ?? _currentConvXml.SelectSingleNode(".//start");

                    if (nodeEl != null)
                    {
                        // Filter choices by conditions (IfHaveQuest etc.) to match what ReadChoicesFromNode showed
                        var allChoiceNodes = nodeEl.SelectNodes("choice");
                        var validChoices = new List<System.Xml.XmlNode>();
                        foreach (System.Xml.XmlNode c in allChoiceNodes)
                        {
                            if (EvaluateConversationConditions(c)) validChoices.Add(c);
                        }

                        if (choiceIdx >= 0 && choiceIdx < validChoices.Count)
                        {
                            var chosen = validChoices[choiceIdx];
                            string choiceText = chosen.InnerText?.Trim() ?? "";
                            if (string.IsNullOrEmpty(choiceText)) { var t = chosen.SelectSingleNode("text"); choiceText = t?.InnerText?.Trim() ?? ""; }
                            choiceText = ConsoleLib.Console.ColorUtility.StripFormatting(choiceText.Split('~')[0].Trim());
                            result["status"] = "ok";
                            result["chose"] = ResolveTextVariables(choiceText, player);

                            string targetId = chosen.Attributes?["Target"]?.Value
                                           ?? chosen.Attributes?["GotoID"]?.Value
                                           ?? "End";
                            result["targetNode"] = targetId;

                            // Process quest triggers AND item parts on the choice
                            var questActions = new List<Dictionary<string, object>>();
                            var itemActions = new List<Dictionary<string, object>>();
                            try
                            {
                                questActions.AddRange(ProcessQuestHandlers(chosen));
                                questActions.AddRange(ProcessChoiceQuestAttributes(chosen));
                                itemActions.AddRange(ProcessConversationItemParts(chosen, player));
                            }
                            catch { }

                            if (targetId != "End")
                            {
                                // Search deeply for the target node
                                var nextNodeEl = _currentConvXml.SelectSingleNode($".//node[@ID='{targetId}']")
                                              ?? _currentConvXml.SelectSingleNode($".//start[@ID='{targetId}']");

                                if (nextNodeEl != null)
                                {
                                    _currentNodeId = targetId;
                                    // Get NPC text with condition evaluation and variable resolution
                                    string npcText = "";
                                    var textNodes = nextNodeEl.SelectNodes("text");
                                    if (textNodes != null && textNodes.Count > 1)
                                    {
                                        foreach (System.Xml.XmlNode tn in textNodes)
                                        {
                                            if (EvaluateConversationConditions(tn)) { npcText = tn.InnerText?.Trim() ?? ""; break; }
                                        }
                                        if (string.IsNullOrEmpty(npcText)) npcText = nextNodeEl.SelectSingleNode("text")?.InnerText?.Trim() ?? "";
                                    }
                                    else npcText = nextNodeEl.SelectSingleNode("text")?.InnerText?.Trim() ?? "";
                                    npcText = ConsoleLib.Console.ColorUtility.StripFormatting(npcText.Split('~')[0].Trim());
                                    result["npcText"] = ResolveTextVariables(npcText, player);

                                    // Collect choices from this node
                                    var nextChoices = ReadChoicesFromNode(nextNodeEl);
                                    result["choices"] = nextChoices;

                                    // If no choices remain, conversation is over — clear state
                                    if (nextChoices.Count == 0)
                                    {
                                        _currentConvXml = null;
                                        _currentNodeId = null;
                                    }

                                    // Process QuestHandler parts, quest attributes, AND item parts on the TARGET NODE
                                    try
                                    {
                                        questActions.AddRange(ProcessQuestHandlers(nextNodeEl));
                                        questActions.AddRange(ProcessChoiceQuestAttributes(nextNodeEl));
                                        itemActions.AddRange(ProcessConversationItemParts(nextNodeEl, player));
                                    }
                                    catch { }
                                }
                                else
                                {
                                    // Node not found — conversation ends (target is likely handled by game logic)
                                    result["message"] = "Conversation advanced to '" + targetId + "' (handled by game)";
                                    result["npcText"] = "(Dialog node '" + targetId + "' is game-controlled)";
                                    result["choices"] = new List<Dictionary<string, string>>();
                                    _currentConvXml = null;
                                    _currentNodeId = null;
                                }
                            }
                            else { result["message"] = "Conversation ended"; _currentConvXml = null; _currentNodeId = null; }

                            if (questActions.Count > 0)
                                result["questActions"] = questActions;
                            if (itemActions.Count > 0)
                                result["itemActions"] = itemActions;
                        }
                        else { result["status"] = "error"; result["message"] = $"Invalid choice {choiceIdx} (have {validChoices.Count} valid choices)"; }
                    }
                    else { result["status"] = "error"; result["message"] = "Current node '" + _currentNodeId + "' not found"; _currentConvXml = null; _currentNodeId = null; }
                }
                catch (Exception ex) { result["status"] = "error"; result["message"] = "Choose error: " + ex.Message; }
            }
            else
            {
                result["status"] = "error";
                result["message"] = _currentConvXml == null ? "No active conversation. Use 'talk' first." : "Usage: choose <number>";
            }
        }
        else if (action == "trade")
        {
            // Open trade with adjacent NPC by name
            var target = FindEntity(player, args.Trim());
            if (target?.CurrentCell != null && player.DistanceTo(target) <= 1)
            {
                string npcName = ConsoleLib.Console.ColorUtility.StripFormatting(target.DisplayName);
                // List the NPC's trade inventory
                var tradeItems = new List<Dictionary<string, string>>();
                if (target.Inventory?.Objects != null)
                {
                    int idx = 0;
                    foreach (var item in target.Inventory.Objects)
                    {
                        string iname = ConsoleLib.Console.ColorUtility.StripFormatting(item.DisplayName ?? "?");
                        string value = "?";
                        try { value = item.ValueEach.ToString(); } catch {}
                        tradeItems.Add(new Dictionary<string, string> { ["index"] = idx.ToString(), ["name"] = iname, ["value"] = value });
                        idx++;
                    }
                }
                result["status"] = "ok";
                result["trader"] = npcName;
                result["items"] = tradeItems;
                result["message"] = tradeItems.Count > 0 ? npcName + " has " + tradeItems.Count + " items" : npcName + " has no trade inventory";
            }
            else if (target == null)
            {
                result["status"] = "error"; result["message"] = "NPC not found: " + args;
            }
            else
            {
                result["status"] = "error"; result["message"] = "Too far to trade. Navigate closer first.";
            }
        }
        else if (action == "activate" || action == "ability")
        {
            // Activate a mutation or ability by name
            string abilityName = args.Trim();
            bool activated = false;

            // Check mutations first
            var mutationsPart = player.GetPart("Mutations");
            if (mutationsPart != null)
            {
                var mutList = mutationsPart.GetType().GetProperty("MutationList")?.GetValue(mutationsPart) as System.Collections.IList;
                if (mutList != null)
                {
                    foreach (var mut in mutList)
                    {
                        string dn = mut.GetType().GetProperty("DisplayName")?.GetValue(mut)?.ToString() ?? "";
                        if (dn.IndexOf(abilityName, StringComparison.OrdinalIgnoreCase) >= 0)
                        {
                            try
                            {
                                var activateMethod = mut.GetType().GetMethod("Activate");
                                if (activateMethod != null)
                                {
                                    activateMethod.Invoke(mut, null);
                                    player.UseEnergy(1000);
                                    result["status"] = "ok";
                                    result["activated"] = dn;
                                    activated = true;
                                }
                                else
                                {
                                    result["status"] = "error";
                                    result["message"] = dn + " has no Activate method (passive mutation?)";
                                }
                            }
                            catch (Exception ex) { result["status"] = "error"; result["message"] = "Activation failed: " + ex.Message; }
                            break;
                        }
                    }
                }
            }

            // Check activated abilities — discover API via reflection
            if (!activated)
            {
                var abilities = player.GetPart("ActivatedAbilities");
                if (abilities != null)
                {
                    // Try multiple known field names for the ability dictionary
                    System.Collections.IDictionary abilityDict = null;
                    foreach (var fname in new[] { "AbilityByGuid", "AbilityList", "_AbilityByGuid" })
                    {
                        abilityDict = abilities.GetType().GetField(fname,
                            System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)
                            ?.GetValue(abilities) as System.Collections.IDictionary;
                        if (abilityDict != null) break;
                    }
                    // Also try properties
                    if (abilityDict == null)
                    {
                        abilityDict = abilities.GetType().GetProperty("AbilityByGuid")?.GetValue(abilities) as System.Collections.IDictionary;
                    }
                    // Fallback: iterate all fields to find a dictionary
                    if (abilityDict == null)
                    {
                        foreach (var fi in abilities.GetType().GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance))
                        {
                            if (typeof(System.Collections.IDictionary).IsAssignableFrom(fi.FieldType))
                            {
                                abilityDict = fi.GetValue(abilities) as System.Collections.IDictionary;
                                if (abilityDict != null && abilityDict.Count > 0) break;
                            }
                        }
                    }

                    if (abilityDict != null)
                    {
                        foreach (System.Collections.DictionaryEntry entry in abilityDict)
                        {
                            var ab = entry.Value;
                            if (ab == null) continue;
                            // Try multiple name properties
                            string abName = null;
                            foreach (var pname in new[] { "DisplayName", "Name", "name" })
                            {
                                abName = ab.GetType().GetProperty(pname)?.GetValue(ab)?.ToString();
                                if (!string.IsNullOrEmpty(abName)) break;
                                abName = ab.GetType().GetField(pname)?.GetValue(ab)?.ToString();
                                if (!string.IsNullOrEmpty(abName)) break;
                            }
                            if (abName == null) abName = ab.ToString();

                            if (abName.IndexOf(abilityName, StringComparison.OrdinalIgnoreCase) >= 0)
                            {
                                try
                                {
                                    string cmd = ab.GetType().GetProperty("Command")?.GetValue(ab)?.ToString()
                                              ?? ab.GetType().GetField("Command")?.GetValue(ab)?.ToString();
                                    if (cmd != null)
                                    {
                                        player.FireEvent(cmd);
                                        player.UseEnergy(1000);
                                        result["status"] = "ok";
                                        result["activated"] = abName;
                                        activated = true;
                                    }
                                }
                                catch (Exception ex) { result["status"] = "error"; result["message"] = "Ability failed: " + ex.Message; }
                                break;
                            }
                        }
                    }
                }
            }

            if (!activated && !result.ContainsKey("status"))
            {
                result["status"] = "error";
                result["message"] = "No mutation or ability matching: " + abilityName;

                // List available — use same discovery approach
                var available = new List<string>();
                var mp = player.GetPart("Mutations");
                if (mp != null)
                {
                    var ml = mp.GetType().GetProperty("MutationList")?.GetValue(mp) as System.Collections.IList;
                    if (ml != null) foreach (var m in ml)
                    {
                        string n = m.GetType().GetProperty("DisplayName")?.GetValue(m)?.ToString();
                        if (n != null) available.Add("[mut] " + n);
                    }
                }
                var aa = player.GetPart("ActivatedAbilities");
                if (aa != null)
                {
                    // Find the ability dictionary same way as above
                    System.Collections.IDictionary ad = null;
                    foreach (var fi in aa.GetType().GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance))
                    {
                        if (typeof(System.Collections.IDictionary).IsAssignableFrom(fi.FieldType))
                        { ad = fi.GetValue(aa) as System.Collections.IDictionary; if (ad != null && ad.Count > 0) break; }
                    }
                    if (ad != null) foreach (System.Collections.DictionaryEntry e in ad)
                    {
                        var ab = e.Value;
                        string n = ab?.GetType().GetProperty("DisplayName")?.GetValue(ab)?.ToString()
                               ?? ab?.GetType().GetProperty("Name")?.GetValue(ab)?.ToString()
                               ?? ab?.ToString() ?? "?";
                        available.Add("[ability] " + n);
                    }
                }
                result["available"] = available;
            }
        }
        else if (action == "useitem")
        {
            // Use a specific item from inventory by name
            if (player.Inventory?.Objects != null && !string.IsNullOrEmpty(args))
            {
                bool used = false;
                foreach (var item in player.Inventory.Objects)
                {
                    if (item.DisplayName?.IndexOf(args.Trim(), StringComparison.OrdinalIgnoreCase) >= 0)
                    {
                        try
                        {
                            item.FireEvent("InvCommandApply");
                            player.UseEnergy(1000);
                            result["status"] = "ok";
                            result["used"] = ConsoleLib.Console.ColorUtility.StripFormatting(item.DisplayName);
                            used = true;
                        }
                        catch (Exception ex) { result["status"] = "error"; result["message"] = "Use failed: " + ex.Message; }
                        break;
                    }
                }
                if (!used && !result.ContainsKey("status")) { result["status"] = "error"; result["message"] = "Item not found: " + args; }
            }
            else { result["status"] = "error"; result["message"] = "Usage: useitem <name>"; }
        }
        else if (action == "status")
        {
            // Full character status dump
            result["status"] = "ok";
            result["name"] = ConsoleLib.Console.ColorUtility.StripFormatting(player.DisplayName ?? "?");
            result["level"] = player.Statistics?.ContainsKey("Level") == true ? player.Statistics["Level"].Value : 0;

            // Spendable points
            result["SP"] = player.Statistics?.ContainsKey("SP") == true ? player.Statistics["SP"].Value : 0;
            result["MP"] = player.Statistics?.ContainsKey("MP") == true ? player.Statistics["MP"].Value : 0;
            result["AP"] = player.Statistics?.ContainsKey("AP") == true ? player.Statistics["AP"].Value : 0;

            // All stats
            var stats = new Dictionary<string, int>();
            if (player.Statistics != null)
            {
                foreach (var kvp in player.Statistics)
                {
                    stats[kvp.Key] = kvp.Value.Value;
                }
            }
            result["stats"] = stats;

            // Mutations with levels
            var muts = new List<Dictionary<string, object>>();
            var mp2 = player.GetPart("Mutations");
            if (mp2 != null)
            {
                var ml2 = mp2.GetType().GetProperty("MutationList")?.GetValue(mp2) as System.Collections.IList;
                if (ml2 != null) foreach (var m in ml2)
                {
                    string dn = m.GetType().GetProperty("DisplayName")?.GetValue(m)?.ToString() ?? "?";
                    int lvl = 0;
                    try { lvl = (int)(m.GetType().GetProperty("Level")?.GetValue(m) ?? 0); } catch {}
                    muts.Add(new Dictionary<string, object> { ["name"] = dn, ["level"] = lvl });
                }
            }
            result["mutations"] = muts;

            // Active abilities — discover via reflection
            var abilities = new List<Dictionary<string, object>>();
            var aa2 = player.GetPart("ActivatedAbilities");
            if (aa2 != null)
            {
                System.Collections.IDictionary ad2 = null;
                foreach (var fi in aa2.GetType().GetFields(System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance))
                {
                    if (typeof(System.Collections.IDictionary).IsAssignableFrom(fi.FieldType))
                    { ad2 = fi.GetValue(aa2) as System.Collections.IDictionary; if (ad2 != null && ad2.Count > 0) break; }
                }
                if (ad2 != null) foreach (System.Collections.DictionaryEntry e in ad2)
                {
                    var ab = e.Value;
                    if (ab == null) continue;
                    string n = ab.GetType().GetProperty("DisplayName")?.GetValue(ab)?.ToString()
                            ?? ab.GetType().GetProperty("Name")?.GetValue(ab)?.ToString()
                            ?? ab.ToString() ?? "?";
                    bool enabled = true;
                    try { enabled = (bool)(ab.GetType().GetProperty("Enabled")?.GetValue(ab) ?? true); } catch {}
                    int cooldown = 0;
                    try { cooldown = (int)(ab.GetType().GetProperty("Cooldown")?.GetValue(ab) ?? ab.GetType().GetField("Cooldown")?.GetValue(ab) ?? 0); } catch {}
                    string cmd = ab.GetType().GetProperty("Command")?.GetValue(ab)?.ToString()
                              ?? ab.GetType().GetField("Command")?.GetValue(ab)?.ToString() ?? "";
                    abilities.Add(new Dictionary<string, object> { ["name"] = n, ["enabled"] = enabled, ["cooldown"] = cooldown, ["command"] = cmd });
                }
            }
            result["abilities"] = abilities;

            // Skills
            var skillNames = new List<string>();
            var sp = player.GetPart("Skills");
            if (sp != null)
            {
                var sl = sp.GetType().GetProperty("SkillList")?.GetValue(sp) as System.Collections.IDictionary;
                if (sl != null) foreach (var key in sl.Keys) skillNames.Add(key.ToString());
            }
            result["skills"] = skillNames;
        }
        else if (action == "worldnav" || action == "goto")
        {
            // Navigate to a named world location via the journal's map notes
            string locationName = args.Trim();
            result["status"] = "error";

            try {
                // Access JournalAPI.MapNotes via reflection (safe for version compatibility)
                var journalType = typeof(XRL.Core.XRLCore).Assembly.GetType("Qud.API.JournalAPI");
                if (journalType != null)
                {
                    // Get the MapNotes list
                    var mapNotesField = journalType.GetField("MapNotes", BindingFlags.Public | BindingFlags.Static);
                    var mapNotes = mapNotesField?.GetValue(null) as System.Collections.IList;

                    if (mapNotes != null)
                    {
                        // List all known locations if no name given
                        if (string.IsNullOrEmpty(locationName) || locationName == "list")
                        {
                            var locations = new List<Dictionary<string, string>>();
                            foreach (var note in mapNotes)
                            {
                                // Get properties via reflection
                                string text = note.GetType().GetProperty("Text")?.GetValue(note)?.ToString() ?? "";
                                string zoneId = note.GetType().GetProperty("ZoneID")?.GetValue(note)?.ToString() ?? "";
                                bool revealed = (bool)(note.GetType().GetProperty("Revealed")?.GetValue(note) ?? false);
                                string category = note.GetType().GetProperty("Category")?.GetValue(note)?.ToString() ?? "";

                                if (revealed && !string.IsNullOrEmpty(zoneId))
                                {
                                    locations.Add(new Dictionary<string, string> {
                                        ["name"] = text,
                                        ["zoneId"] = zoneId,
                                        ["category"] = category
                                    });
                                }
                            }
                            result["status"] = "ok";
                            result["locations"] = locations;
                            result["message"] = locations.Count + " known locations";
                        }
                        else
                        {
                            // Find matching location by name
                            string bestZoneId = null;
                            string bestName = null;

                            foreach (var note in mapNotes)
                            {
                                string text = note.GetType().GetProperty("Text")?.GetValue(note)?.ToString() ?? "";
                                string zoneId = note.GetType().GetProperty("ZoneID")?.GetValue(note)?.ToString() ?? "";
                                bool revealed = (bool)(note.GetType().GetProperty("Revealed")?.GetValue(note) ?? false);

                                if (revealed && !string.IsNullOrEmpty(zoneId) &&
                                    text.IndexOf(locationName, StringComparison.OrdinalIgnoreCase) >= 0)
                                {
                                    bestZoneId = zoneId;
                                    bestName = text;
                                    break;
                                }
                            }

                            if (bestZoneId != null)
                            {
                                result["status"] = "ok";
                                result["location"] = bestName;
                                result["targetZoneId"] = bestZoneId;

                                // Parse zone ID to get world coordinates
                                // Format: "JoppaWorld.X.Y.localX.localY.Z"
                                var zoneParts = bestZoneId.Split('.');
                                if (zoneParts.Length >= 3)
                                {
                                    int worldX, worldY;
                                    if (int.TryParse(zoneParts[1], out worldX) && int.TryParse(zoneParts[2], out worldY))
                                    {
                                        // Get current world position
                                        var currentZone = player.CurrentCell?.ParentZone?.ZoneID ?? "";
                                        var currentParts = currentZone.Split('.');
                                        int curWorldX = 0, curWorldY = 0;
                                        if (currentParts.Length >= 3)
                                        {
                                            int.TryParse(currentParts[1], out curWorldX);
                                            int.TryParse(currentParts[2], out curWorldY);
                                        }

                                        result["worldTarget"] = new Dictionary<string, int> { ["x"] = worldX, ["y"] = worldY };
                                        result["worldCurrent"] = new Dictionary<string, int> { ["x"] = curWorldX, ["y"] = curWorldY };

                                        // Calculate direction
                                        int dx = worldX - curWorldX;
                                        int dy = worldY - curWorldY;
                                        string direction = "";
                                        if (dy < 0) direction += "north";
                                        if (dy > 0) direction += "south";
                                        if (dx > 0) direction += "east";
                                        if (dx < 0) direction += "west";
                                        result["direction"] = direction;
                                        result["worldDistance"] = Math.Abs(dx) + Math.Abs(dy);
                                        result["message"] = $"{bestName} is {Math.Abs(dx) + Math.Abs(dy)} world tiles {direction} (world {worldX},{worldY} from {curWorldX},{curWorldY})";
                                    }
                                }
                            }
                            else
                            {
                                result["message"] = "Location not found in journal: " + locationName;

                                // List available locations as hint
                                var available = new List<string>();
                                foreach (var note in mapNotes)
                                {
                                    string text = note.GetType().GetProperty("Text")?.GetValue(note)?.ToString() ?? "";
                                    bool revealed = (bool)(note.GetType().GetProperty("Revealed")?.GetValue(note) ?? false);
                                    if (revealed) available.Add(text);
                                }
                                if (available.Count > 0) result["available"] = available;
                            }
                        }
                    }
                }
            }
            catch (Exception ex) {
                result["message"] = "Journal access error: " + ex.Message;
            }
        }
        else
        {
            // Map all other commands to Qud's internal command IDs
            var cmdMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
            {
                // Adventuring (talk removed — handled above)
                ["get"] = "CmdGet", ["use"] = "CmdUse",
                ["open"] = "CmdOpen", ["look"] = "CmdLook", ["fire"] = "CmdFire",
                ["throw"] = "CmdThrow", ["interact"] = "CmdGetFrom",
                ["autoexplore"] = "CmdAutoExplore", ["autoattack"] = "CmdAutoAttack",
                ["reload"] = "CmdReload",
                // Waiting
                ["wait"] = "CmdWait", ["rest"] = "CmdWaitUntilHealed",
                ["wait20"] = "CmdWait20", ["wait100"] = "CmdWait100",
                ["restmorning"] = "CmdWaitUntilMorning",
                // Menus / info
                ["inventory"] = "CmdInventory", ["equipment"] = "CmdEquipment",
                ["character"] = "CmdCharacter", ["skills"] = "CmdSkillsPowers",
                ["abilities"] = "CmdAbilities", ["quests"] = "CmdQuests",
                ["journal"] = "CmdJournal", ["factions"] = "CmdFactions",
                ["tinkering"] = "CmdTinkering", ["messages"] = "CmdMessageHistory",
                // Force attack directions
                ["attack n"] = "CmdAttackN", ["attack s"] = "CmdAttackS",
                ["attack e"] = "CmdAttackE", ["attack w"] = "CmdAttackW",
                ["attack ne"] = "CmdAttackNE", ["attack nw"] = "CmdAttackNW",
                ["attack se"] = "CmdAttackSE", ["attack sw"] = "CmdAttackSW",
                // Navigation
                ["center"] = "CmdMoveCenter",
                // System
                ["save"] = "CmdSave",
            };

            string fullCmd = (action + (string.IsNullOrEmpty(args) ? "" : " " + args)).Trim();
            if (cmdMap.TryGetValue(fullCmd, out string qudCmd) || cmdMap.TryGetValue(action, out qudCmd))
            {
                // Fire as a game command
                player.FireEvent(qudCmd);
                player.UseEnergy(1000);
                result["status"] = "ok";
                result["qudCommand"] = qudCmd;
            }
            else
            {
                result["status"] = "unknown";
                result["message"] = "Unknown command: " + fullCmd;
                result["hint"] = "Available: move, wait, rest, look, talk, get, use, open, fire, throw, interact, attack <dir>, autoexplore, autoattack, inventory, equipment, character, skills, abilities, quests, journal, worldnav, save";
            }
        }

        result["position"] = new Dictionary<string, int>
        {
            ["x"] = player.CurrentCell?.X ?? -1,
            ["y"] = player.CurrentCell?.Y ?? -1
        };

        return result;
    }

    void WriteScreenBuffer()
    {
        EnsureDir();
        var player = ParentObject;
        if (player?.CurrentCell?.ParentZone == null) return;
        var zone = player.CurrentCell.ParentZone;
        var sb = new StringBuilder();
        int px = player.CurrentCell.X, py = player.CurrentCell.Y;

        for (int y = Math.Max(0, py - 12); y <= Math.Min(zone.Height - 1, py + 12); y++)
        {
            for (int x = Math.Max(0, px - 40); x <= Math.Min(zone.Width - 1, px + 40); x++)
            {
                var c = zone.GetCell(x, y);
                if (c == null) { sb.Append(' '); continue; }
                if (x == px && y == py) { sb.Append('@'); continue; }
                bool found = false;
                if (c.HasObject())
                {
                    foreach (var obj in c.GetObjectsInCell())
                    {
                        var r = obj.GetPart<Render>();
                        if (r != null && !string.IsNullOrEmpty(r.RenderString))
                        { sb.Append(r.RenderString[0]); found = true; break; }
                    }
                }
                if (!found) sb.Append(c.IsSolid() ? '#' : '.');
            }
            sb.AppendLine();
        }
        File.WriteAllText(ScreenPath, sb.ToString());
    }

    static void LogError(string ctx, Exception ex)
    {
        EnsureDir();
        try { File.AppendAllText(Path.Combine(IpcDir, "error.log"), $"[{DateTime.Now}] [{ctx}] {ex}\n\n"); }
        catch { }
    }

    // ═══════════════════════════════════════════════════════════════════
    // TYPED HARNESS PROTOCOL — request.json / response.json
    // ═══════════════════════════════════════════════════════════════════

    /// <summary>
    /// Translate a typed action dictionary to a legacy command string.
    /// The typed action has a "type" key and additional parameters.
    /// Returns the command string that ExecuteCommand() understands.
    /// </summary>
    public static string TranslateTypedAction(Dictionary<string, object> action)
    {
        if (action == null || !action.ContainsKey("type"))
            return null;

        string type = action["type"]?.ToString() ?? "";

        switch (type)
        {
            case "movement.step":
            {
                string direction = action.ContainsKey("direction") ? action["direction"]?.ToString() ?? "" : "";
                return "move " + direction;
            }
            case "movement.path_to":
            case "movement.navigate":
            {
                if (action.ContainsKey("target"))
                    return "navigate " + action["target"]?.ToString();
                if (action.ContainsKey("x") && action.ContainsKey("y"))
                    return "navigate " + action["x"] + " " + action["y"];
                return null;
            }
            case "interaction.talk":
            case "interact.talk":
            {
                string target = action.ContainsKey("target") ? action["target"]?.ToString() ?? "" : "";
                return "talkto " + target;
            }
            case "interaction.choose_dialogue":
            case "interact.choose_dialogue":
            {
                string choice = action.ContainsKey("choice") ? action["choice"]?.ToString() ?? "0" : "0";
                return "choose " + choice;
            }
            case "combat.melee":
            case "combat.attack":
            {
                if (action.ContainsKey("target"))
                    return "attack " + action["target"]?.ToString();
                if (action.ContainsKey("direction"))
                    return "attack " + action["direction"]?.ToString();
                return null;
            }
            case "inventory.consume_food":
                return "eat";
            case "inventory.consume_water":
                return "drink";
            case "inventory.equip":
            {
                string item = action.ContainsKey("item") ? action["item"]?.ToString() ?? "" : "";
                return "equip " + item;
            }
            case "inventory.pickup":
            {
                string item = action.ContainsKey("item") ? action["item"]?.ToString() ?? "" : "";
                return "pickup " + item;
            }
            case "observe.examine":
            {
                string target = action.ContainsKey("target") ? action["target"]?.ToString() ?? "" : "";
                return "examine " + target;
            }
            case "interact.trade":
            case "interaction.trade":
            {
                string target = action.ContainsKey("target") ? action["target"]?.ToString() ?? "" : "";
                return "trade " + target;
            }
            case "observe.status":
                return "status";
            case "observe.look":
                return "look";
            case "ability.activate":
            {
                string ability = action.ContainsKey("ability") ? action["ability"]?.ToString() ?? "" : "";
                return "activate " + ability;
            }
            case "system.save":
                return "save";
            case "system.status":
                return "status";
            case "survival.rest":
                return "rest";
            default:
                return null;
        }
    }

    /// <summary>
    /// Navigate a dot-separated path through a nested dictionary / list structure.
    /// Returns the value at the path, or null if not found.
    /// </summary>
    static object ResolveStatePath(Dictionary<string, object> state, string path)
    {
        if (state == null || string.IsNullOrEmpty(path))
            return null;

        string[] segments = path.Split('.');
        object current = state;

        foreach (string seg in segments)
        {
            if (current == null) return null;

            // Try dictionary access
            if (current is Dictionary<string, object> dict)
            {
                if (dict.ContainsKey(seg))
                    current = dict[seg];
                else
                    return null;
            }
            else if (current is Dictionary<string, string> sdict)
            {
                if (sdict.ContainsKey(seg))
                    current = sdict[seg];
                else
                    return null;
            }
            else if (current is Dictionary<string, int> idict)
            {
                if (idict.ContainsKey(seg))
                    current = idict[seg];
                else
                    return null;
            }
            else if (current is Dictionary<string, bool> bdict)
            {
                if (bdict.ContainsKey(seg))
                    current = bdict[seg];
                else
                    return null;
            }
            // Try list access by numeric index
            else if (current is System.Collections.IList list)
            {
                if (int.TryParse(seg, out int idx) && idx >= 0 && idx < list.Count)
                    current = list[idx];
                else
                    return null;
            }
            else
            {
                // Try reflection as last resort
                try
                {
                    var prop = current.GetType().GetProperty(seg);
                    if (prop != null)
                    {
                        current = prop.GetValue(current);
                        continue;
                    }
                    var field = current.GetType().GetField(seg);
                    if (field != null)
                    {
                        current = field.GetValue(current);
                        continue;
                    }
                }
                catch { }
                return null;
            }
        }

        return current;
    }

    /// <summary>
    /// Evaluate a list of assertions against the current game state.
    /// Each assertion has a "path" (dot-separated), and a condition
    /// (equals, greaterThan, lessThan, contains, notEmpty).
    /// Returns a list of assertion result dictionaries.
    /// </summary>
    static List<Dictionary<string, object>> EvaluateAssertions(
        Dictionary<string, object> state,
        List<Dictionary<string, object>> assertions)
    {
        var results = new List<Dictionary<string, object>>();
        if (assertions == null) return results;

        foreach (var assertion in assertions)
        {
            var aResult = new Dictionary<string, object>();
            string path = assertion.ContainsKey("path") ? assertion["path"]?.ToString() ?? "" : "";
            aResult["path"] = path;

            object actual = ResolveStatePath(state, path);
            aResult["actualValue"] = actual ?? "(null)";
            bool passed = false;

            try
            {
                if (assertion.ContainsKey("equals"))
                {
                    object expected = assertion["equals"];
                    aResult["condition"] = "equals";
                    aResult["expected"] = expected;
                    if (actual == null)
                        passed = expected == null;
                    else if (expected is bool expectedBool)
                        passed = (actual is bool ab && ab == expectedBool)
                              || actual.ToString().Equals(expectedBool.ToString(), StringComparison.OrdinalIgnoreCase);
                    else if (expected is long expectedLong)
                        passed = Convert.ToInt64(actual) == expectedLong;
                    else if (expected is double expectedDouble)
                        passed = Math.Abs(Convert.ToDouble(actual) - expectedDouble) < 0.001;
                    else
                        passed = actual.ToString().Equals(expected.ToString(), StringComparison.OrdinalIgnoreCase);
                }
                else if (assertion.ContainsKey("greaterThan"))
                {
                    aResult["condition"] = "greaterThan";
                    double threshold = Convert.ToDouble(assertion["greaterThan"]);
                    aResult["expected"] = threshold;
                    passed = Convert.ToDouble(actual) > threshold;
                }
                else if (assertion.ContainsKey("lessThan"))
                {
                    aResult["condition"] = "lessThan";
                    double threshold = Convert.ToDouble(assertion["lessThan"]);
                    aResult["expected"] = threshold;
                    passed = Convert.ToDouble(actual) < threshold;
                }
                else if (assertion.ContainsKey("contains"))
                {
                    aResult["condition"] = "contains";
                    string needle = assertion["contains"]?.ToString() ?? "";
                    aResult["expected"] = needle;

                    if (actual is System.Collections.IList list)
                    {
                        foreach (var item in list)
                        {
                            if (item == null) continue;
                            // For list of dicts (e.g. quests), check "name" field
                            if (item is Dictionary<string, string> sd && sd.ContainsKey("name") &&
                                sd["name"].IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0)
                            { passed = true; break; }
                            if (item is Dictionary<string, object> od && od.ContainsKey("name") &&
                                od["name"]?.ToString()?.IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0)
                            { passed = true; break; }
                            if (item.ToString().IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0)
                            { passed = true; break; }
                        }
                    }
                    else if (actual is string s)
                    {
                        passed = s.IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0;
                    }
                    else if (actual != null)
                    {
                        passed = actual.ToString().IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0;
                    }
                }
                else if (assertion.ContainsKey("notEmpty"))
                {
                    aResult["condition"] = "notEmpty";
                    if (actual is System.Collections.IList list)
                        passed = list.Count > 0;
                    else if (actual is string s)
                        passed = !string.IsNullOrEmpty(s);
                    else
                        passed = actual != null;
                }
            }
            catch (Exception ex)
            {
                aResult["error"] = ex.Message;
            }

            aResult["passed"] = passed;
            results.Add(aResult);
        }

        return results;
    }

    /// <summary>
    /// Evaluate postconditions by comparing pre-state and post-state.
    /// Supports delta conditions (changed, unchanged, increased, decreased)
    /// and static conditions (equals, greaterThan, lessThan, contains, notEmpty).
    /// Used by perform_action to verify an action achieved its intended effect.
    /// </summary>
    static List<Dictionary<string, object>> EvaluatePostconditions(
        Dictionary<string, object> preState,
        Dictionary<string, object> postState,
        List<Dictionary<string, object>> postconditions)
    {
        var results = new List<Dictionary<string, object>>();
        if (postconditions == null) return results;

        foreach (var pc in postconditions)
        {
            var result = new Dictionary<string, object>();
            string pcPath = pc.ContainsKey("path") ? pc["path"]?.ToString() ?? "" : "";
            string condition = pc.ContainsKey("condition") ? pc["condition"]?.ToString() ?? "" : "";
            result["path"] = pcPath;
            result["condition"] = condition;

            object preValue = ResolveStatePath(preState, pcPath);
            object postValue = ResolveStatePath(postState, pcPath);
            result["priorValue"] = preValue ?? "(null)";
            result["currentValue"] = postValue ?? "(null)";

            bool passed = false;

            try
            {
                switch (condition)
                {
                    // Delta conditions — compare pre vs post
                    case "changed":
                        passed = !string.Equals(preValue?.ToString(), postValue?.ToString());
                        break;
                    case "unchanged":
                        passed = string.Equals(preValue?.ToString(), postValue?.ToString());
                        break;
                    case "increased":
                        passed = PostconditionToDouble(postValue) > PostconditionToDouble(preValue);
                        break;
                    case "decreased":
                        passed = PostconditionToDouble(postValue) < PostconditionToDouble(preValue);
                        break;

                    // Static conditions — evaluate against post-state only
                    case "equals":
                    {
                        object expected = pc.ContainsKey("expected") ? pc["expected"] : null;
                        result["expected"] = expected;
                        if (postValue == null)
                            passed = expected == null;
                        else if (expected is bool eb)
                            passed = (postValue is bool pb && pb == eb)
                                  || postValue.ToString().Equals(eb.ToString(), StringComparison.OrdinalIgnoreCase);
                        else if (expected is long el)
                            passed = Convert.ToInt64(postValue) == el;
                        else if (expected is double ed)
                            passed = Math.Abs(Convert.ToDouble(postValue) - ed) < 0.001;
                        else
                            passed = postValue.ToString().Equals(expected?.ToString() ?? "", StringComparison.OrdinalIgnoreCase);
                        break;
                    }
                    case "greaterThan":
                    {
                        double threshold = Convert.ToDouble(pc.ContainsKey("expected") ? pc["expected"] : 0);
                        result["expected"] = threshold;
                        passed = Convert.ToDouble(postValue) > threshold;
                        break;
                    }
                    case "lessThan":
                    {
                        double threshold = Convert.ToDouble(pc.ContainsKey("expected") ? pc["expected"] : 0);
                        result["expected"] = threshold;
                        passed = Convert.ToDouble(postValue) < threshold;
                        break;
                    }
                    case "contains":
                    {
                        string needle = pc.ContainsKey("expected") ? pc["expected"]?.ToString() ?? "" : "";
                        result["expected"] = needle;
                        passed = postValue?.ToString()?.IndexOf(needle, StringComparison.OrdinalIgnoreCase) >= 0;
                        break;
                    }
                    case "notEmpty":
                    {
                        if (postValue is System.Collections.IList pcList)
                            passed = pcList.Count > 0;
                        else if (postValue is string s)
                            passed = !string.IsNullOrEmpty(s);
                        else
                            passed = postValue != null;
                        break;
                    }
                    default:
                        result["error"] = "Unknown postcondition: " + condition;
                        break;
                }
            }
            catch (Exception ex)
            {
                result["error"] = ex.Message;
            }

            result["passed"] = passed;
            results.Add(result);
        }

        return results;
    }

    static double PostconditionToDouble(object val)
    {
        if (val == null) return 0;
        if (double.TryParse(val.ToString(), out double d)) return d;
        return 0;
    }

    /// <summary>
    /// Process a typed request (request.json) and write response.json.
    /// This is the entry point for the typed harness protocol.
    /// </summary>
    public static void ProcessRequest(GameObject player, string requestJson)
    {
        EnsureDir();

        var response = new Dictionary<string, object>();
        string commandId = null;
        long issuedAgainstVersion = -1;

        try
        {
            var request = JsonConvert.DeserializeObject<Dictionary<string, object>>(requestJson);
            if (request == null)
            {
                response["status"] = "error";
                response["failures"] = new List<string> { "Could not parse request JSON" };
                WriteResponse(response);
                return;
            }

            // Extract envelope fields
            commandId = request.ContainsKey("commandId") ? request["commandId"]?.ToString() : null;
            response["commandId"] = commandId;

            if (request.ContainsKey("issuedAgainstStateVersion"))
            {
                try { issuedAgainstVersion = Convert.ToInt64(request["issuedAgainstStateVersion"]); }
                catch { }
            }
            response["issuedAgainstStateVersion"] = issuedAgainstVersion;

            // Stale-state warning: if issued version is more than 10 behind current
            var warnings = new List<string>();
            if (issuedAgainstVersion >= 0 && (_stateVersion - issuedAgainstVersion) > 10)
            {
                warnings.Add($"Request was issued against stateVersion {issuedAgainstVersion} but current is {_stateVersion} (>{10} versions behind). State may have changed significantly.");
            }

            // Parse the inner request
            object reqObj = request.ContainsKey("request") ? request["request"] : null;
            Dictionary<string, object> innerRequest = null;

            if (reqObj is Newtonsoft.Json.Linq.JObject jObj)
                innerRequest = jObj.ToObject<Dictionary<string, object>>();
            else if (reqObj is Dictionary<string, object> dict)
                innerRequest = dict;

            if (innerRequest == null)
            {
                response["status"] = "error";
                response["failures"] = new List<string> { "Missing or invalid 'request' object in envelope" };
                if (warnings.Count > 0) response["warnings"] = warnings;
                WriteResponse(response);
                return;
            }

            string kind = innerRequest.ContainsKey("kind") ? innerRequest["kind"]?.ToString() : null;
            var effectsList = new List<string>();
            var failuresList = new List<string>();

            switch (kind)
            {
                case "perform_action":
                {
                    // Extract the typed action and translate to command string
                    object actionObj = innerRequest.ContainsKey("action") ? innerRequest["action"] : null;
                    Dictionary<string, object> actionDict = null;

                    if (actionObj is Newtonsoft.Json.Linq.JObject aJObj)
                        actionDict = aJObj.ToObject<Dictionary<string, object>>();
                    else if (actionObj is Dictionary<string, object> aDict)
                        actionDict = aDict;

                    if (actionDict == null)
                    {
                        response["status"] = "error";
                        failuresList.Add("Missing or invalid 'action' object in perform_action request");
                        break;
                    }

                    // Extract postconditions from request (optional)
                    List<Dictionary<string, object>> postconditions = null;
                    Dictionary<string, object> preState = null;

                    object pcObj = innerRequest.ContainsKey("postconditions") ? innerRequest["postconditions"] : null;
                    if (pcObj is Newtonsoft.Json.Linq.JArray pcArr)
                    {
                        postconditions = new List<Dictionary<string, object>>();
                        foreach (var item in pcArr)
                        {
                            if (item is Newtonsoft.Json.Linq.JObject pcJo)
                                postconditions.Add(pcJo.ToObject<Dictionary<string, object>>());
                        }
                        if (postconditions.Count > 0)
                        {
                            // Capture pre-state snapshot for delta comparisons
                            WriteStateStatic(player);
                            try
                            {
                                string preJson = File.ReadAllText(StatePath);
                                preState = DeepConvertJObjects(
                                    JsonConvert.DeserializeObject<Dictionary<string, object>>(preJson));
                            }
                            catch { }
                        }
                    }

                    string cmdString = TranslateTypedAction(actionDict);
                    if (cmdString == null)
                    {
                        response["status"] = "error";
                        failuresList.Add("Unknown action type: " + (actionDict.ContainsKey("type") ? actionDict["type"]?.ToString() : "(none)"));
                        break;
                    }

                    // Execute via existing command pipeline
                    var cmdResult = ExecuteCommand(player, cmdString);
                    response["status"] = cmdResult.ContainsKey("status") ? cmdResult["status"]?.ToString() ?? "error" : "error";
                    response["result"] = cmdResult;

                    // Detect effects from the result
                    if (cmdResult.ContainsKey("conversationId")) effectsList.Add("conversation_opened");
                    if (cmdResult.ContainsKey("npcText")) effectsList.Add("dialogue_received");
                    if (cmdResult.ContainsKey("choices")) effectsList.Add("choices_available");
                    if (cmdResult.ContainsKey("moved")) effectsList.Add("moved");
                    if (cmdResult.ContainsKey("equipped")) effectsList.Add("item_equipped");
                    if (cmdResult.ContainsKey("picked")) effectsList.Add("item_picked_up");
                    if (cmdResult.ContainsKey("consumed")) effectsList.Add("item_consumed");
                    if (cmdResult.ContainsKey("activated")) effectsList.Add("ability_activated");
                    if (cmdResult.ContainsKey("questActions")) effectsList.Add("quest_updated");
                    if (cmdResult.ContainsKey("target") && (cmdString.StartsWith("navigate") || cmdString.StartsWith("attack")))
                        effectsList.Add("navigation_completed");

                    // Evaluate postconditions if provided
                    if (postconditions != null && postconditions.Count > 0)
                    {
                        // Capture post-state for comparison
                        WriteStateStatic(player);
                        Dictionary<string, object> postState = null;
                        try
                        {
                            string postJson = File.ReadAllText(StatePath);
                            postState = DeepConvertJObjects(
                                JsonConvert.DeserializeObject<Dictionary<string, object>>(postJson));
                        }
                        catch { }

                        if (preState != null && postState != null)
                        {
                            var pcResults = EvaluatePostconditions(preState, postState, postconditions);
                            bool allMet = true;
                            foreach (var r in pcResults)
                            {
                                if (r.ContainsKey("passed") && r["passed"] is bool pVal && !pVal)
                                { allMet = false; break; }
                            }
                            response["postconditions"] = new Dictionary<string, object>
                            {
                                ["evaluated"] = true,
                                ["allMet"] = allMet,
                                ["results"] = pcResults
                            };
                        }
                        else
                        {
                            response["postconditions"] = new Dictionary<string, object>
                            {
                                ["evaluated"] = false,
                                ["error"] = "Could not capture state for postcondition evaluation"
                            };
                        }
                    }

                    break;
                }

                case "assert_state":
                {
                    // Build fresh state to evaluate assertions against
                    // We call WriteStateStatic which writes to file; read the state by
                    // building it inline instead (to avoid double-write)
                    WriteStateStatic(player);
                    string stateJson = null;
                    try { stateJson = File.ReadAllText(StatePath); }
                    catch { }

                    Dictionary<string, object> currentState = null;
                    if (stateJson != null)
                    {
                        try { currentState = JsonConvert.DeserializeObject<Dictionary<string, object>>(stateJson); }
                        catch { }
                    }

                    if (currentState == null)
                    {
                        response["status"] = "error";
                        failuresList.Add("Could not read current game state for assertion evaluation");
                        break;
                    }

                    // Parse assertions list
                    object assertionsObj = innerRequest.ContainsKey("assertions") ? innerRequest["assertions"] : null;
                    List<Dictionary<string, object>> assertionsList = null;

                    if (assertionsObj is Newtonsoft.Json.Linq.JArray jArr)
                    {
                        assertionsList = new List<Dictionary<string, object>>();
                        foreach (var item in jArr)
                        {
                            if (item is Newtonsoft.Json.Linq.JObject jo)
                                assertionsList.Add(jo.ToObject<Dictionary<string, object>>());
                        }
                    }
                    else if (assertionsObj is List<Dictionary<string, object>> aList)
                    {
                        assertionsList = aList;
                    }

                    if (assertionsList == null || assertionsList.Count == 0)
                    {
                        response["status"] = "error";
                        failuresList.Add("No assertions provided in assert_state request");
                        break;
                    }

                    // Evaluate
                    // Need to deserialize the state more deeply for nested dict traversal.
                    // JObjects from Newtonsoft need conversion.
                    Dictionary<string, object> deepState = DeepConvertJObjects(currentState);
                    var assertionResults = EvaluateAssertions(deepState, assertionsList);
                    response["result"] = new Dictionary<string, object> { ["assertions"] = assertionResults };
                    bool allPassed = true;
                    foreach (var ar in assertionResults)
                    {
                        if (ar.ContainsKey("passed") && ar["passed"] is bool p && !p)
                        { allPassed = false; break; }
                    }
                    response["status"] = allPassed ? "succeeded" : "failed";
                    if (!allPassed)
                    {
                        foreach (var ar in assertionResults)
                        {
                            if (ar.ContainsKey("passed") && ar["passed"] is bool p2 && !p2)
                                failuresList.Add("Assertion failed: " + (ar.ContainsKey("path") ? ar["path"] : "?") +
                                    " (" + (ar.ContainsKey("condition") ? ar["condition"] : "?") + ")");
                        }
                    }
                    effectsList.Add("state_asserted");
                    break;
                }

                case "checkpoint_save":
                {
                    var saveResult = ExecuteCommand(player, "save");
                    response["status"] = saveResult.ContainsKey("status") ? saveResult["status"]?.ToString() ?? "ok" : "ok";
                    response["result"] = saveResult;
                    effectsList.Add("game_saved");
                    break;
                }

                case "wait_until":
                {
                    // Evaluate a condition against current state and report whether it's met.
                    // Does NOT block — the harness is responsible for polling.
                    WriteStateStatic(player);
                    string stateJson2 = null;
                    try { stateJson2 = File.ReadAllText(StatePath); }
                    catch { }

                    Dictionary<string, object> currentState2 = null;
                    if (stateJson2 != null)
                    {
                        try { currentState2 = JsonConvert.DeserializeObject<Dictionary<string, object>>(stateJson2); }
                        catch { }
                    }

                    if (currentState2 == null)
                    {
                        response["status"] = "error";
                        failuresList.Add("Could not read current state for wait_until evaluation");
                        break;
                    }

                    Dictionary<string, object> deepState2 = DeepConvertJObjects(currentState2);

                    // The condition is provided as a single assertion
                    object condObj = innerRequest.ContainsKey("condition") ? innerRequest["condition"] : null;
                    Dictionary<string, object> condDict = null;
                    if (condObj is Newtonsoft.Json.Linq.JObject cJObj)
                        condDict = cJObj.ToObject<Dictionary<string, object>>();
                    else if (condObj is Dictionary<string, object> cDict)
                        condDict = cDict;

                    if (condDict == null)
                    {
                        response["status"] = "error";
                        failuresList.Add("Missing 'condition' in wait_until request");
                        break;
                    }

                    var condResults = EvaluateAssertions(deepState2, new List<Dictionary<string, object>> { condDict });
                    bool condMet = condResults.Count > 0 && condResults[0].ContainsKey("passed") && condResults[0]["passed"] is bool cp && cp;

                    response["result"] = new Dictionary<string, object>
                    {
                        ["conditionMet"] = condMet,
                        ["evaluation"] = condResults.Count > 0 ? condResults[0] : null
                    };
                    response["status"] = condMet ? "succeeded" : "failed";
                    if (condMet) effectsList.Add("condition_met");
                    break;
                }

                default:
                {
                    response["status"] = "error";
                    failuresList.Add("Unknown request kind: " + (kind ?? "(null)"));
                    break;
                }
            }

            response["effects"] = effectsList;
            response["failures"] = failuresList;
            if (warnings.Count > 0) response["warnings"] = warnings;

            // Capture events that were emitted during processing
            response["events"] = _pendingEvents.ToList();
        }
        catch (Exception ex)
        {
            response["commandId"] = commandId;
            response["status"] = "error";
            response["failures"] = new List<string> { "Exception processing request: " + ex.Message };
            try { File.AppendAllText(Path.Combine(IpcDir, "error.log"),
                $"[{DateTime.Now}] [ProcessRequest] {ex}\n\n"); } catch { }
        }

        // Always include observed state version after processing
        response["observedStateVersionAfter"] = _stateVersion;

        WriteResponse(response);
    }

    /// <summary>
    /// Write the response.json file atomically.
    /// </summary>
    static void WriteResponse(Dictionary<string, object> response)
    {
        EnsureDir();
        try
        {
            string json = JsonConvert.SerializeObject(response, Formatting.Indented);
            string tmp = ResponsePath + ".tmp";
            File.WriteAllText(tmp, json);
            if (File.Exists(ResponsePath)) File.Delete(ResponsePath);
            File.Move(tmp, ResponsePath);
        }
        catch (Exception ex)
        {
            try { File.AppendAllText(Path.Combine(IpcDir, "error.log"),
                $"[{DateTime.Now}] [WriteResponse] {ex}\n\n"); } catch { }
        }
    }

    /// <summary>
    /// Recursively convert Newtonsoft JObject/JArray/JValue instances
    /// into plain Dictionary/List/primitive types so that ResolveStatePath
    /// can traverse them without needing JObject-specific handling.
    /// </summary>
    static Dictionary<string, object> DeepConvertJObjects(Dictionary<string, object> source)
    {
        if (source == null) return null;
        var result = new Dictionary<string, object>();
        foreach (var kv in source)
        {
            result[kv.Key] = DeepConvertValue(kv.Value);
        }
        return result;
    }

    static object DeepConvertValue(object value)
    {
        if (value == null) return null;

        if (value is Newtonsoft.Json.Linq.JObject jObj)
        {
            var dict = new Dictionary<string, object>();
            foreach (var prop in jObj.Properties())
                dict[prop.Name] = DeepConvertValue(prop.Value);
            return dict;
        }
        if (value is Newtonsoft.Json.Linq.JArray jArr)
        {
            var list = new List<object>();
            foreach (var item in jArr)
                list.Add(DeepConvertValue(item));
            return list;
        }
        if (value is Newtonsoft.Json.Linq.JValue jVal)
        {
            return jVal.Value;
        }
        if (value is Dictionary<string, object> dict2)
        {
            return DeepConvertJObjects(dict2);
        }
        return value;
    }
}
