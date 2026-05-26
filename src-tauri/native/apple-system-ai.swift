import Foundation
import FoundationModels

struct Request: Codable {
    let mode: String
    let prompt: String?
    let instructions: String?
}

struct ResponsePayload: Codable {
    let ok: Bool
    let available: Bool
    let reason: String?
    let output: String?
    let error: String?
}

enum HelperError: LocalizedError {
    case invalidRequest(String)

    var errorDescription: String? {
        switch self {
        case .invalidRequest(let message):
            return message
        }
    }
}

func availabilityPayload(for model: SystemLanguageModel) -> ResponsePayload {
    switch model.availability {
    case .available:
        return ResponsePayload(ok: true, available: true, reason: nil, output: nil, error: nil)
    case .unavailable(let reason):
        return ResponsePayload(ok: true, available: false, reason: String(describing: reason), output: nil, error: nil)
    }
}

func printResponse(_ payload: ResponsePayload) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = []

    do {
        let data = try encoder.encode(payload)
        FileHandle.standardOutput.write(data)
    } catch {
        let fallback = #"{"ok":false,"available":false,"error":"encoding_failed"}"#
        FileHandle.standardOutput.write(Data(fallback.utf8))
    }
}

@main
struct RecipeVaultAppleSystemAI {
    static func main() async {
        do {
            let input = FileHandle.standardInput.readDataToEndOfFile()
            let request = try JSONDecoder().decode(Request.self, from: input)
            let model = SystemLanguageModel.default

            if request.mode == "status" {
                printResponse(availabilityPayload(for: model))
                return
            }

            guard request.mode == "complete" else {
                throw HelperError.invalidRequest("Unsupported mode")
            }

            guard case .available = model.availability else {
                let payload = availabilityPayload(for: model)
                printResponse(ResponsePayload(
                    ok: false,
                    available: payload.available,
                    reason: payload.reason,
                    output: nil,
                    error: "Apple Foundation Models non disponibile"
                ))
                return
            }

            let prompt = (request.prompt ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !prompt.isEmpty else {
                throw HelperError.invalidRequest("Prompt vuoto")
            }

            let instructionsText = (request.instructions ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            let session = instructionsText.isEmpty
                ? LanguageModelSession()
                : LanguageModelSession(instructions: instructionsText)
            let response = try await session.respond(to: prompt)

            printResponse(ResponsePayload(
                ok: true,
                available: true,
                reason: nil,
                output: response.content,
                error: nil
            ))
        } catch {
            printResponse(ResponsePayload(
                ok: false,
                available: false,
                reason: nil,
                output: nil,
                error: "\(String(describing: error)) | \(error.localizedDescription)"
            ))
        }
    }
}
