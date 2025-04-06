using System; // Add System namespace
using System.Collections.Generic;
using System.Text.Json.Serialization; // For ignoring non-serializable properties
using System.Threading; // For CancellationTokenSource
using System.Threading.Tasks; // For Task

namespace PsychoRabble.API.Models
{
    public class GameState
    {
        public List<string> AvailableWords { get; set; } = new List<string>();
        public string CurrentPhase { get; set; } = "PENDING"; // Default to PENDING
        public DateTimeOffset? RoundStartTime { get; set; } = null; // When timer started (or null)
        public List<string> SubmittedPlayers { get; set; } = new List<string>();
        public Dictionary<string, string> SubmittedSentences { get; set; } = new Dictionary<string, string>();
        public Dictionary<string, int> Votes { get; set; } = new Dictionary<string, int>(); 
        public List<string> VotedPlayers { get; set; } = new List<string>(); 
        public List<string> Winners { get; set; } = new List<string>(); 
        public List<string> ReadyPlayers { get; set; } = new List<string>(); 
        // Removed timer task properties
    }
}
