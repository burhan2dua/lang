import contextlib
import json
import math
import pathlib
import sys
import traceback
import zipfile


def emit(event_type, **values):
    sys.__stdout__.write(json.dumps({"type": event_type, **values}, ensure_ascii=False) + "\n")
    sys.__stdout__.flush()


def align_groups(segments, window_seconds=30, max_segments=40):
    groups = []
    current = []
    group_start = None

    for segment in segments:
        start = float(segment["start"])
        end = float(segment["end"])
        if group_start is not None and (
            start - group_start >= window_seconds or len(current) >= max_segments
        ):
            groups.append(current)
            current = []
            group_start = None
        if group_start is None:
            group_start = start
        text = str(segment.get("text", "")).replace("<b>", "").replace("</b>", "").strip()
        if text and end > start:
            current.append({"start": start, "end": end, "text": text})

    if current:
        groups.append(current)
    return groups


def load_alignment_model(whisperx, language):
    try:
        return whisperx.load_align_model(language_code=language, device="cpu")
    except RuntimeError as error:
        if language != "en" or "failed finding central directory" not in str(error):
            raise

        import torch
        import torchaudio

        bundle = torchaudio.pipelines.WAV2VEC2_ASR_BASE_960H
        checkpoint = pathlib.Path(torch.hub.get_dir()) / "checkpoints" / bundle._path
        if not checkpoint.is_file() or zipfile.is_zipfile(checkpoint):
            raise error

        checkpoint.unlink()
        emit(
            "progress",
            stage="loading-model",
            progress=45,
            message="Cache model bahasa Inggris rusak; mengunduh ulang model penyelaras...",
        )
        return whisperx.load_align_model(language_code=language, device="cpu")


def main():
    request = json.load(sys.stdin)
    output_dir = pathlib.Path(request["outputDir"])
    url = request["url"]
    segments = request["segments"]
    language = str(request["language"]).split("-")[0].lower()

    emit("progress", stage="downloading", progress=3, message="Mengunduh audio saja dari YouTube...")
    import yt_dlp

    def download_progress(event):
        if event.get("status") == "downloading":
            total = event.get("total_bytes") or event.get("total_bytes_estimate")
            downloaded = event.get("downloaded_bytes", 0)
            percent = min(100, downloaded * 100 / total) if total else 0
            emit(
                "progress",
                stage="downloading",
                progress=3 + percent * 0.32,
                message=f"Mengunduh audio saja... {percent:.0f}%",
            )
        elif event.get("status") == "finished":
            emit("progress", stage="downloading", progress=36, message="Audio selesai diunduh.")

    output_dir.mkdir(parents=True, exist_ok=True)
    options = {
        "format": "bestaudio/best",
        "outtmpl": str(output_dir / "source.%(ext)s"),
        "noplaylist": True,
        "quiet": True,
        "no_warnings": True,
        "progress_hooks": [download_progress],
    }
    with yt_dlp.YoutubeDL(options) as downloader:
        info = downloader.extract_info(url, download=True)
        audio_path = pathlib.Path(downloader.prepare_filename(info))

    if not audio_path.exists():
        candidates = [file for file in output_dir.iterdir() if file.is_file()]
        if not candidates:
            raise RuntimeError("Audio video tidak berhasil diunduh.")
        audio_path = candidates[0]

    emit("progress", stage="loading-audio", progress=39, message="Memuat audio untuk penyelarasan...")
    with contextlib.redirect_stdout(sys.stderr):
        import whisperx

    audio = whisperx.load_audio(str(audio_path))

    emit(
        "progress",
        stage="loading-model",
        progress=45,
        message=f"Memuat model penyelaras bahasa {language.upper()} (CPU, unduhan pertama dapat memakan waktu)...",
    )
    with contextlib.redirect_stdout(sys.stderr):
        model, metadata = load_alignment_model(whisperx, language)

    groups = align_groups(segments)
    if not groups:
        raise RuntimeError("Tidak ada caption valid yang dapat diselaraskan.")

    words = []
    unaligned = 0
    for index, group in enumerate(groups, start=1):
        with contextlib.redirect_stdout(sys.stderr):
            aligned = whisperx.align(
                group,
                model,
                metadata,
                audio,
                "cpu",
                return_char_alignments=False,
            )
        for caption in aligned.get("segments", []):
            for word in caption.get("words", []):
                start = word.get("start")
                end = word.get("end")
                text = str(word.get("word", "")).strip()
                if (
                    not text
                    or not isinstance(start, (int, float))
                    or not isinstance(end, (int, float))
                    or not math.isfinite(start)
                    or not math.isfinite(end)
                    or end <= start
                ):
                    if text:
                        unaligned += 1
                    continue
                words.append(
                    {
                        "start": round(float(start), 3),
                        "end": round(float(end), 3),
                        "text": text,
                        "score": round(float(word["score"]), 4)
                        if isinstance(word.get("score"), (int, float))
                        and math.isfinite(word["score"])
                        else None,
                    }
                )
        progress = 48 + index * 50 / len(groups)
        emit(
            "progress",
            stage="aligning",
            progress=progress,
            message=f"Menyelaraskan caption ke audio... {index}/{len(groups)} bagian",
        )

    words.sort(key=lambda word: (word["start"], word["end"]))
    if not words:
        raise RuntimeError("Model tidak berhasil menyelaraskan kata. Coba caption bahasa lain.")

    emit(
        "result",
        words=words,
        language=language,
        unalignedWords=unaligned,
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        emit("error", message=f"{type(error).__name__}: {error}")
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)
